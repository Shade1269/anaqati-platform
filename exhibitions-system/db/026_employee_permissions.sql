-- ============================================================
-- صلاحيات الموظف الدقيقة | Migration 026
-- يخصّصها المالك أو مدير بصلاحية can_manage_employees. تُفرض فعليًا في
-- دوال التوكن (027). الافتراضي: كل الصلاحيات مسموحة (لا صف = مسموح).
-- ============================================================

create table if not exists exhibitions.employee_permissions (
  profile_id uuid primary key references exhibitions.profiles(id) on delete cascade,
  tenant_id uuid not null references exhibitions.tenants(id) on delete cascade,
  can_sell boolean not null default true,
  can_return boolean not null default true,
  can_request_stock boolean not null default true,
  can_withdraw boolean not null default true,
  can_settle boolean not null default true,
  can_waiter boolean not null default true,
  can_kitchen boolean not null default true,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_set_tenant on exhibitions.employee_permissions;
create trigger trg_set_tenant before insert on exhibitions.employee_permissions
  for each row execute function exhibitions._set_tenant();
create index if not exists idx_emp_perms_tenant on exhibitions.employee_permissions(tenant_id);
alter table exhibitions.employee_permissions enable row level security;
drop policy if exists admin_all on exhibitions.employee_permissions;
create policy admin_all on exhibitions.employee_permissions for all to authenticated
  using (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id())
  with check (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id());
drop policy if exists mgr_emp on exhibitions.employee_permissions;
create policy mgr_emp on exhibitions.employee_permissions for all to authenticated
  using (exhibitions._im_can('can_manage_employees') and tenant_id=exhibitions.current_tenant_id())
  with check (exhibitions._im_can('can_manage_employees') and tenant_id=exhibitions.current_tenant_id());
grant select,insert,update,delete on exhibitions.employee_permissions to authenticated;
grant all on exhibitions.employee_permissions to service_role;

-- يرفع استثناءً إن كان للموظف صفّ والعَلَم false. لا صف = مسموح (توافق رجعي).
create or replace function exhibitions._emp_require(p_profile_id uuid, p_perm text)
returns void language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
declare v boolean;
begin
  execute format('select %I from exhibitions.employee_permissions where profile_id=$1', p_perm)
    into v using p_profile_id;
  if v is not null and v = false then raise exception 'غير مصرّح لك بهذه العملية'; end if;
end $function$;
revoke execute on function exhibitions._emp_require(uuid,text) from public, anon, authenticated;

create or replace function exhibitions.employee_perms_get(p_profile_id uuid)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
declare v_t uuid;
begin
  if not exhibitions._im_can('can_manage_employees') then raise exception 'غير مصرّح'; end if;
  v_t := exhibitions.current_tenant_id();
  if not exists(select 1 from exhibitions.profiles where id=p_profile_id and tenant_id=v_t and role='employee') then
    raise exception 'الموظف غير موجود'; end if;
  return (select json_build_object(
    'can_sell',coalesce(ep.can_sell,true),'can_return',coalesce(ep.can_return,true),
    'can_request_stock',coalesce(ep.can_request_stock,true),'can_withdraw',coalesce(ep.can_withdraw,true),
    'can_settle',coalesce(ep.can_settle,true),'can_waiter',coalesce(ep.can_waiter,true),
    'can_kitchen',coalesce(ep.can_kitchen,true))
   from (select p_profile_id) s
   left join exhibitions.employee_permissions ep on ep.profile_id=p_profile_id);
end $function$;

create or replace function exhibitions.employee_perms_set(
  p_profile_id uuid, p_sell boolean, p_return boolean, p_request_stock boolean,
  p_withdraw boolean, p_settle boolean, p_waiter boolean, p_kitchen boolean)
returns void language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_t uuid;
begin
  if not exhibitions._im_can('can_manage_employees') then raise exception 'غير مصرّح'; end if;
  v_t := exhibitions.current_tenant_id();
  if not exists(select 1 from exhibitions.profiles where id=p_profile_id and tenant_id=v_t and role='employee') then
    raise exception 'الموظف غير موجود'; end if;
  insert into exhibitions.employee_permissions(profile_id,tenant_id,can_sell,can_return,can_request_stock,can_withdraw,can_settle,can_waiter,can_kitchen,updated_at)
    values(p_profile_id,v_t,p_sell,p_return,p_request_stock,p_withdraw,p_settle,p_waiter,p_kitchen,now())
  on conflict (profile_id) do update set
    can_sell=excluded.can_sell, can_return=excluded.can_return, can_request_stock=excluded.can_request_stock,
    can_withdraw=excluded.can_withdraw, can_settle=excluded.can_settle, can_waiter=excluded.can_waiter,
    can_kitchen=excluded.can_kitchen, updated_at=now();
end $function$;

grant execute on function exhibitions.employee_perms_get(uuid) to authenticated;
grant execute on function exhibitions.employee_perms_set(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;
