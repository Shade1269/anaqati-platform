-- ============================================================
-- فصل الأدوار: تفويض المدير (Manager Delegation) | Migration 013
-- المالك (admin) للإشراف والمال؛ المدير (inventory_manager + صلاحيات)
-- يشيل التشغيل: الموظفين + المتجر/المخزون — بدون رؤية تكلفة/أرباح/راتب.
-- ============================================================
alter table exhibitions.im_permissions add column if not exists can_manage_employees boolean not null default false;
alter table exhibitions.im_permissions add column if not exists can_manage_store boolean not null default false;

-- create_employee: المدير المفوّض يضيف (الراتب للمالك فقط)
create or replace function exhibitions.create_employee(
  p_full_name text, p_phone text, p_monthly_salary numeric, p_access_code text default null, p_hire_date date default current_date)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_pid uuid; v_code text; v_salary numeric;
begin
  if not exhibitions._im_can('can_manage_employees') then raise exception 'غير مصرّح'; end if;
  v_code := coalesce(nullif(p_access_code,''), lpad((floor(random()*1000000))::int::text,6,'0'));
  v_salary := case when exhibitions.is_admin() then coalesce(p_monthly_salary,0) else 0 end;
  insert into exhibitions.profiles(full_name,phone,role,status) values(p_full_name,p_phone,'employee','active') returning id into v_pid;
  insert into exhibitions.employee_details(profile_id,access_code,monthly_salary_sar,hire_date) values(v_pid,v_code,v_salary,p_hire_date);
  return json_build_object('profile_id',v_pid,'access_code',v_code);
end $$;

create or replace function exhibitions.record_attendance(p_employee_id uuid, p_work_date date, p_status text, p_branch_id uuid default null)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
begin
  if not exhibitions._im_can('can_manage_employees') then raise exception 'غير مصرّح'; end if;
  if not exists(select 1 from exhibitions.profiles where id=p_employee_id and tenant_id=exhibitions.current_tenant_id()) then raise exception 'الموظف غير موجود'; end if;
  insert into exhibitions.attendance(employee_id,work_date,status,branch_id,recorded_by)
  values (p_employee_id,p_work_date,p_status::exhibitions.attendance_status,p_branch_id,exhibitions.current_profile_id())
  on conflict (employee_id,work_date) do update set status=excluded.status, branch_id=excluded.branch_id, recorded_by=excluded.recorded_by;
end $$;

-- قائمة موظفين بدون راتب (للمدير)
create or replace function exhibitions.mgr_list_employees()
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
begin
  if not exhibitions._im_can('can_manage_employees') then raise exception 'غير مصرّح'; end if;
  return (select coalesce(json_agg(json_build_object('id',pr.id,'full_name',pr.full_name,'phone',pr.phone,'status',pr.status,
      'access_code',ed.access_code,'hire_date',ed.hire_date,'is_active',ed.is_active) order by pr.full_name),'[]')
    from exhibitions.profiles pr left join exhibitions.employee_details ed on ed.profile_id=pr.id
    where pr.role='employee' and pr.tenant_id=exhibitions.current_tenant_id());
end $$;

-- المتجر/المخزون: تفويض المدير (نفس fulfill/status لكن بصلاحية can_manage_store)
create or replace function exhibitions.set_online_order_status(p_order_id uuid, p_status text)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
begin
  if not exhibitions._im_can('can_manage_store') then raise exception 'غير مصرّح'; end if;
  update exhibitions.online_orders set status=p_status where id=p_order_id and tenant_id=exhibitions.current_tenant_id() and status in ('new','confirmed');
end $$;

create or replace function exhibitions.fulfill_online_order(p_order_id uuid, p_warehouse_id uuid)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid; v_actor uuid; v_pm exhibitions.payment_method; v_fee numeric; v_cash text; rec record; v_cost numeric; v_rev numeric:=0; v_cogs numeric:=0; v_total numeric;
begin
  if not exhibitions._im_can('can_manage_store') then raise exception 'غير مصرّح'; end if;
  v_t := exhibitions.current_tenant_id(); v_actor := exhibitions.current_profile_id();
  select payment_method, delivery_fee_sar into v_pm, v_fee from exhibitions.online_orders where id=p_order_id and tenant_id=v_t and status in ('new','confirmed');
  if not found then raise exception 'الطلب غير موجود أو مُنفّذ مسبقًا'; end if;
  for rec in select product_id, qty, unit_price_sar from exhibitions.online_order_items where order_id=p_order_id and tenant_id=v_t loop
    select cost_price_sar into v_cost from exhibitions.products where id=rec.product_id;
    perform exhibitions._move_stock(rec.product_id,rec.qty,'warehouse',p_warehouse_id,null,null,'sale','online_orders',p_order_id,v_actor);
    v_rev := v_rev + rec.qty*rec.unit_price_sar; v_cogs := v_cogs + rec.qty*coalesce(v_cost,0);
  end loop;
  v_total := v_rev + coalesce(v_fee,0);
  v_cash := case when v_pm='card' then '1020' else '1010' end;
  perform exhibitions._post(current_date,'طلب متجر إلكتروني','online_orders',p_order_id,
    jsonb_build_array(jsonb_build_object('account',v_cash,'debit',v_total,'credit',0),
      jsonb_build_object('account','4030','debit',0,'credit',v_total),
      jsonb_build_object('account','5010','debit',v_cogs,'credit',0),
      jsonb_build_object('account','1100','debit',0,'credit',v_cogs)));
  update exhibitions.online_orders set status='fulfilled', fulfilled_by=v_actor where id=p_order_id;
  return json_build_object('order_id',p_order_id,'revenue',v_total,'cogs',v_cogs);
end $$;

create or replace function exhibitions.update_store_settings(p_enabled boolean, p_description text, p_whatsapp text, p_delivery_fee numeric, p_cod boolean)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
begin
  if not exhibitions._im_can('can_manage_store') then raise exception 'غير مصرّح'; end if;
  update exhibitions.tenants set store_enabled=coalesce(p_enabled,store_enabled), store_description=p_description, store_whatsapp=p_whatsapp,
    delivery_fee=coalesce(p_delivery_fee,delivery_fee), cod_enabled=coalesce(p_cod,cod_enabled) where id=exhibitions.current_tenant_id();
end $$;

create or replace function exhibitions.store_set_product(p_id uuid, p_online_enabled boolean, p_online_price numeric, p_image_url text, p_description text)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
begin
  if not exhibitions._im_can('can_manage_store') then raise exception 'غير مصرّح'; end if;
  update exhibitions.products set online_enabled=coalesce(p_online_enabled,online_enabled), online_price=p_online_price, image_url=p_image_url, description=p_description
  where id=p_id and tenant_id=exhibitions.current_tenant_id();
end $$;

drop policy if exists mgr_store_select on exhibitions.online_orders;
create policy mgr_store_select on exhibitions.online_orders for select to authenticated using (exhibitions._im_can('can_manage_store') and tenant_id=exhibitions.current_tenant_id());
drop policy if exists mgr_store_select on exhibitions.online_order_items;
create policy mgr_store_select on exhibitions.online_order_items for select to authenticated using (exhibitions._im_can('can_manage_store') and tenant_id=exhibitions.current_tenant_id());

create or replace function exhibitions.set_im_permissions(
  p_profile_id uuid, p_add_stock boolean, p_approve boolean, p_transfers boolean,
  p_wholesale boolean, p_returns boolean, p_manage_employees boolean default false, p_manage_store boolean default false)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  if not exists(select 1 from exhibitions.profiles where id=p_profile_id and tenant_id=exhibitions.current_tenant_id()) then raise exception 'المستخدم غير موجود'; end if;
  insert into exhibitions.im_permissions(profile_id,can_add_stock,can_approve_requests,can_issue_transfers,can_issue_wholesale,can_receive_returns,can_manage_employees,can_manage_store,updated_at)
    values(p_profile_id,p_add_stock,p_approve,p_transfers,p_wholesale,p_returns,p_manage_employees,p_manage_store,now())
  on conflict (profile_id) do update set can_add_stock=excluded.can_add_stock, can_approve_requests=excluded.can_approve_requests,
    can_issue_transfers=excluded.can_issue_transfers, can_issue_wholesale=excluded.can_issue_wholesale, can_receive_returns=excluded.can_receive_returns,
    can_manage_employees=excluded.can_manage_employees, can_manage_store=excluded.can_manage_store, updated_at=now();
end $$;

grant execute on function exhibitions.mgr_list_employees() to authenticated;
grant execute on function exhibitions.update_store_settings(boolean,text,text,numeric,boolean) to authenticated;
grant execute on function exhibitions.store_set_product(uuid,boolean,numeric,text,text) to authenticated;
grant execute on function exhibitions.set_im_permissions(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;

-- ============================================================
-- إقفال كل تقارير المال/التكلفة/الأرباح/الراتب على المالك فقط
-- (financial_summary, income_statement, balance_sheet, trial_balance,
--  account_ledger, cash_flow, branch_pnl, supplier_balances,
--  employee_file, employee_consignment_report) — تمت إضافة is_admin()
--  داخل كل دالة. النسخ النهائية مطبّقة على القاعدة (migration restrict_financial_reports_to_owner).
-- ============================================================
