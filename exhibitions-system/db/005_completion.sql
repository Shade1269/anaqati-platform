-- ============================================================
-- نظام المعارض — إكمال الثغرات (Migration 005)
-- سجل التدقيق + اعتماد العمولة + الإشعارات + الحضور
-- ============================================================

-- ---------- Audit helper + triggers ----------
create or replace function exhibitions._audit(p_action text, p_entity text, p_entity_id uuid, p_before jsonb, p_after jsonb)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
begin
  insert into exhibitions.audit_log(actor_id,action,entity,entity_id,before,after)
  values (exhibitions.current_profile_id(), p_action, p_entity, p_entity_id, p_before, p_after);
end $$;

create or replace function exhibitions._audit_branches() returns trigger
language plpgsql security definer set search_path=exhibitions,public as $$
begin
  if NEW.status is distinct from OLD.status then
    perform exhibitions._audit('branch_status_change','branches',NEW.id,
      jsonb_build_object('status',OLD.status), jsonb_build_object('status',NEW.status));
  end if;
  return NEW;
end $$;
drop trigger if exists trg_audit_branches on exhibitions.branches;
create trigger trg_audit_branches after update on exhibitions.branches
  for each row execute function exhibitions._audit_branches();

create or replace function exhibitions._audit_profiles() returns trigger
language plpgsql security definer set search_path=exhibitions,public as $$
begin
  if (NEW.role is distinct from OLD.role) or (NEW.status is distinct from OLD.status) then
    perform exhibitions._audit('profile_change','profiles',NEW.id,
      jsonb_build_object('role',OLD.role,'status',OLD.status),
      jsonb_build_object('role',NEW.role,'status',NEW.status));
  end if;
  return NEW;
end $$;
drop trigger if exists trg_audit_profiles on exhibitions.profiles;
create trigger trg_audit_profiles after update on exhibitions.profiles
  for each row execute function exhibitions._audit_profiles();

create or replace function exhibitions._audit_products() returns trigger
language plpgsql security definer set search_path=exhibitions,public as $$
begin
  if (NEW.cost_price_sar is distinct from OLD.cost_price_sar) or (NEW.sale_price_ref is distinct from OLD.sale_price_ref) then
    perform exhibitions._audit('product_price_change','products',NEW.id,
      jsonb_build_object('cost',OLD.cost_price_sar,'price',OLD.sale_price_ref),
      jsonb_build_object('cost',NEW.cost_price_sar,'price',NEW.sale_price_ref));
  end if;
  return NEW;
end $$;
drop trigger if exists trg_audit_products on exhibitions.products;
create trigger trg_audit_products after update on exhibitions.products
  for each row execute function exhibitions._audit_products();

create or replace function exhibitions._audit_settlements() returns trigger
language plpgsql security definer set search_path=exhibitions,public as $$
begin
  if NEW.status is distinct from OLD.status then
    perform exhibitions._audit('settlement_'||NEW.status,'consignment_settlements',NEW.id,
      jsonb_build_object('status',OLD.status),
      jsonb_build_object('status',NEW.status,'confirmed',NEW.admin_confirmed_amount_sar,'shortage',NEW.shortage_sar));
  end if;
  return NEW;
end $$;
drop trigger if exists trg_audit_settlements on exhibitions.consignment_settlements;
create trigger trg_audit_settlements after update on exhibitions.consignment_settlements
  for each row execute function exhibitions._audit_settlements();

-- ---------- اعتماد/صرف العمولة ----------
create or replace function exhibitions.set_commission_status(p_branch_id uuid, p_status text)
returns integer language plpgsql security definer set search_path=exhibitions,public as $$
declare n integer;
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  update exhibitions.commissions set status=p_status::exhibitions.commission_status
   where branch_id=p_branch_id and status<>'cancelled';
  get diagnostics n = row_count;
  perform exhibitions._audit('commission_'||p_status,'commissions',p_branch_id,null,jsonb_build_object('count',n));
  -- إشعار المستفيدين عند الاعتماد
  if p_status in ('approved','paid') then
    insert into exhibitions.notifications(recipient_id,type,title,body,ref_table,ref_id)
      select beneficiary_id,'commission',
        case when p_status='paid' then 'تم صرف العمولة' else 'تم اعتماد العمولة' end,
        'عمولة معرض بقيمة '||commission_sar::text||' ر.س','commissions',id
      from exhibitions.commissions where branch_id=p_branch_id and beneficiary_id is not null and status<>'cancelled';
  end if;
  return n;
end $$;

-- ---------- الإشعارات ----------
create or replace function exhibitions.mark_notification_read(p_id uuid)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
begin
  update exhibitions.notifications set is_read=true
   where id=p_id and recipient_id=exhibitions.current_profile_id();
end $$;

create or replace function exhibitions.employee_notifications(p_token uuid)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v uuid;
begin
  v := exhibitions._employee_from_token(p_token);
  return (select coalesce(json_agg(json_build_object(
      'id',id,'title',title,'body',body,'is_read',is_read,'created_at',created_at) order by created_at desc),'[]')
    from exhibitions.notifications where recipient_id=v);
end $$;

create or replace function exhibitions.employee_mark_read(p_token uuid, p_id uuid)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v uuid;
begin
  v := exhibitions._employee_from_token(p_token);
  update exhibitions.notifications set is_read=true where id=p_id and recipient_id=v;
end $$;

-- ---------- الحضور ----------
create or replace function exhibitions.record_attendance(p_employee_id uuid, p_work_date date, p_status text, p_branch_id uuid default null)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  insert into exhibitions.attendance(employee_id,work_date,status,branch_id,recorded_by)
  values (p_employee_id,p_work_date,p_status::exhibitions.attendance_status,p_branch_id,exhibitions.current_profile_id())
  on conflict (employee_id,work_date) do update set
    status=excluded.status, branch_id=excluded.branch_id, recorded_by=excluded.recorded_by;
end $$;

-- ---------- grants ----------
grant execute on function exhibitions.set_commission_status(uuid,text) to authenticated;
grant execute on function exhibitions.mark_notification_read(uuid) to authenticated;
grant execute on function exhibitions.record_attendance(uuid,date,text,uuid) to authenticated;
grant execute on function exhibitions.employee_notifications(uuid) to anon, authenticated;
grant execute on function exhibitions.employee_mark_read(uuid,uuid) to anon, authenticated;
