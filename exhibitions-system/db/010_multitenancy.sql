-- ============================================================
-- Multi-tenant SaaS (White-label) | Migration 010
-- يحوّل النظام إلى منصة متعددة العملاء مع عزل تام للبيانات.
-- طُبّقت على مراحل (phase1..phase3). كلها مجمّعة هنا بالترتيب.
-- ملاحظات:
--  * accounts/app_config/sms_templates = عامة مشتركة (بدون tenant_id).
--  * بقية الجداول = معزولة بـ tenant_id + RLS + ختم تلقائي.
--  * current_tenant_id(): من config الجلسة (للموظف عبر التوكن) أو من profile (للأدمن).
--  * دوال التقارير (SECURITY DEFINER) تفلتر يدويًا بـ current_tenant_id().
-- ============================================================

-- ---------- Phase 1: الأساس ----------
create table if not exists exhibitions.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text unique,
  status text not null default 'active' check (status in ('active','suspended')),
  subscription_status text not null default 'active' check (subscription_status in ('trial','active','expired')),
  subscription_expires_at date,
  brand_name text, logo_url text, primary_color text,
  created_at timestamptz not null default now());

create table if not exists exhibitions.platform_admins (
  auth_user_id uuid primary key, full_name text, created_at timestamptz not null default now());

insert into exhibitions.tenants(id, name, slug, brand_name, primary_color)
  values ('00000000-0000-0000-0000-0000000000a1','العميل الأول','default','Black Axis','#C9A24B')
  on conflict do nothing;
insert into exhibitions.platform_admins(auth_user_id, full_name)
  select auth_user_id, full_name from exhibitions.profiles where role='admin' and auth_user_id is not null
  on conflict do nothing;

create or replace function exhibitions.is_platform_admin()
returns boolean language sql stable security definer set search_path=exhibitions,public as $$
  select exists(select 1 from exhibitions.platform_admins where auth_user_id = auth.uid());
$$;

create or replace function exhibitions.current_tenant_id()
returns uuid language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v uuid; v_cfg text;
begin
  v_cfg := current_setting('exhibitions.current_tenant', true);
  if v_cfg is not null and v_cfg <> '' then return v_cfg::uuid; end if;
  select tenant_id into v from exhibitions.profiles where auth_user_id = auth.uid() limit 1;
  return v;
end $$;

create or replace function exhibitions._set_tenant() returns trigger
language plpgsql security definer set search_path=exhibitions,public as $$
begin
  if NEW.tenant_id is null then NEW.tenant_id := exhibitions.current_tenant_id(); end if;
  return NEW;
end $$;

do $$
declare t text; v_def uuid := '00000000-0000-0000-0000-0000000000a1';
  tbls text[] := array[
    'profiles','employee_details','im_permissions','suppliers','categories','products',
    'warehouses','branches','inventory','stock_movements','stock_receipts','stock_receipt_items',
    'stock_requests','stock_request_items','stock_transfers','stock_transfer_items',
    'sales','sale_items','sale_returns','sale_return_items','consignment_withdrawals',
    'consignment_settlements','expenses','wholesale_orders','wholesale_order_items',
    'attendance','salary_advances','payroll','commissions','notifications','audit_log',
    'employee_sessions','supplier_payments','journal_entries','journal_lines'];
begin
  foreach t in array tbls loop
    execute format('alter table exhibitions.%I add column if not exists tenant_id uuid references exhibitions.tenants(id) on delete cascade', t);
    execute format('update exhibitions.%I set tenant_id=%L where tenant_id is null', t, v_def);
    execute format('alter table exhibitions.%I alter column tenant_id set not null', t);
    execute format('drop trigger if exists trg_set_tenant on exhibitions.%I', t);
    execute format('create trigger trg_set_tenant before insert on exhibitions.%I for each row execute function exhibitions._set_tenant()', t);
    execute format('create index if not exists idx_%s_tenant on exhibitions.%I(tenant_id)', t, t);
  end loop;
end $$;

alter table exhibitions.sms_log add column if not exists tenant_id uuid references exhibitions.tenants(id) on delete cascade;
alter table exhibitions.products drop constraint if exists products_product_code_key;
create unique index if not exists products_tenant_code_uniq on exhibitions.products(tenant_id, product_code);
alter table exhibitions.employee_details drop constraint if exists employee_details_access_code_key;

alter table exhibitions.tenants enable row level security;
alter table exhibitions.platform_admins enable row level security;
drop policy if exists platform_all on exhibitions.tenants;
create policy platform_all on exhibitions.tenants for all to authenticated
  using (exhibitions.is_platform_admin()) with check (exhibitions.is_platform_admin());
drop policy if exists tenant_self_read on exhibitions.tenants;
create policy tenant_self_read on exhibitions.tenants for select to authenticated
  using (id = exhibitions.current_tenant_id());
drop policy if exists platform_admins_self on exhibitions.platform_admins;
create policy platform_admins_self on exhibitions.platform_admins for select to authenticated
  using (auth_user_id = auth.uid() or exhibitions.is_platform_admin());
grant all on exhibitions.tenants, exhibitions.platform_admins to service_role;
grant select on exhibitions.tenants to authenticated;
grant execute on function exhibitions.is_platform_admin() to authenticated, anon;
grant execute on function exhibitions.current_tenant_id() to authenticated, anon;

-- ---------- Phase 2: العزل (دخول الموظف + RLS) ----------
-- ملاحظة: employee_login و _employee_from_token يضبطان config الجلسة بالعميل.
-- (انظر النسخ النهائية في الدوال أدناه — مطبّقة فعليًا على القاعدة)
-- RLS لكل الجداول: admin_all = is_admin() AND tenant_id=current_tenant_id()
--                  im_select  = is_inventory_manager() AND tenant_id=current_tenant_id()
do $$
declare t text;
  scoped text[] := array[
    'profiles','employee_details','im_permissions','suppliers','categories','products',
    'warehouses','branches','inventory','stock_movements','stock_receipts','stock_receipt_items',
    'stock_requests','stock_request_items','stock_transfers','stock_transfer_items',
    'sales','sale_items','sale_returns','sale_return_items','consignment_withdrawals',
    'consignment_settlements','expenses','wholesale_orders','wholesale_order_items',
    'attendance','salary_advances','payroll','commissions','notifications','audit_log',
    'employee_sessions','supplier_payments','journal_entries','journal_lines'];
  im_tbls text[] := array[
    'branches','warehouses','suppliers','categories','inventory',
    'stock_requests','stock_request_items','stock_transfers','stock_transfer_items',
    'stock_receipts','stock_receipt_items','wholesale_orders','wholesale_order_items',
    'consignment_withdrawals','notifications'];
begin
  foreach t in array scoped loop
    execute format('drop policy if exists admin_all on exhibitions.%I', t);
    execute format('create policy admin_all on exhibitions.%I for all to authenticated using (exhibitions.is_admin() and tenant_id = exhibitions.current_tenant_id()) with check (exhibitions.is_admin() and tenant_id = exhibitions.current_tenant_id())', t);
  end loop;
  foreach t in array im_tbls loop
    execute format('drop policy if exists im_select on exhibitions.%I', t);
    execute format('create policy im_select on exhibitions.%I for select to authenticated using (exhibitions.is_inventory_manager() and tenant_id = exhibitions.current_tenant_id())', t);
  end loop;
end $$;
drop policy if exists admin_all on exhibitions.sms_log;
create policy admin_all on exhibitions.sms_log for all to authenticated
  using (exhibitions.is_admin() and tenant_id = exhibitions.current_tenant_id()) with check (exhibitions.is_admin());

-- ============================================================
-- ملاحظة مهمة: الدوال (employee_login, _employee_from_token, my_profile,
-- ensure_my_profile, is_admin, is_inventory_manager, وكل دوال التقارير)
-- أُعيدت كتابتها لتفلتر بـ current_tenant_id(). النسخ النهائية موجودة في
-- الدوال داخل ملفات الهجرة 002/003/006/008/009 بعد تطبيق تعديلات العزل،
-- بالإضافة إلى دوال التزويد أدناه (Phase 3).
-- ============================================================

-- ---------- Phase 3: التزويد + إدارة المنصة ----------
create or replace function exhibitions.create_tenant(
  p_name text, p_admin_email text, p_admin_password text,
  p_brand_name text default null, p_primary_color text default '#C9A24B',
  p_subscription_expires date default null)
returns json language plpgsql security definer set search_path=exhibitions,public,extensions as $$
declare v_t uuid; v_uid uuid; v_pid uuid; v_email text := lower(trim(p_admin_email));
begin
  if not exhibitions.is_platform_admin() then raise exception 'غير مصرّح'; end if;
  if exists(select 1 from auth.users where email=v_email) then raise exception 'البريد الإلكتروني مستخدم مسبقًا'; end if;
  insert into exhibitions.tenants(name,brand_name,primary_color,subscription_expires_at)
    values(p_name, coalesce(nullif(p_brand_name,''),p_name), coalesce(p_primary_color,'#C9A24B'), p_subscription_expires) returning id into v_t;
  v_uid := gen_random_uuid();
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,
     raw_app_meta_data,raw_user_meta_data,is_super_admin,confirmation_token,email_change,email_change_token_new,recovery_token)
   values('00000000-0000-0000-0000-000000000000',v_uid,'authenticated','authenticated',v_email,
     extensions.crypt(p_admin_password, extensions.gen_salt('bf')),now(),now(),now(),
     '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,false,'','','','');
  insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
   values(gen_random_uuid(),v_email,v_uid,json_build_object('sub',v_uid::text,'email',v_email,'email_verified',true)::jsonb,'email',now(),now(),now());
  insert into exhibitions.profiles(auth_user_id,full_name,role,status,tenant_id)
    values(v_uid, p_name||' - مدير', 'admin','active', v_t) returning id into v_pid;
  return json_build_object('tenant_id',v_t,'admin_email',v_email,'profile_id',v_pid);
end $$;

create or replace function exhibitions.platform_list_tenants()
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
begin
  if not exhibitions.is_platform_admin() then raise exception 'غير مصرّح'; end if;
  return coalesce((select json_agg(row_to_json(t) order by t.created_at) from (
    select tn.id,tn.name,tn.brand_name,tn.primary_color,tn.status,tn.subscription_status,tn.subscription_expires_at,tn.created_at,
      (select count(*) from exhibitions.profiles p where p.tenant_id=tn.id and p.role='employee') as employees,
      (select count(*) from exhibitions.branches b where b.tenant_id=tn.id) as branches,
      (select coalesce(sum(total_sar),0) from exhibitions.sales s where s.tenant_id=tn.id and s.status='completed') as sales_total,
      (select u.email from auth.users u join exhibitions.profiles pa on pa.auth_user_id=u.id
        where pa.tenant_id=tn.id and pa.role='admin' order by pa.created_at limit 1) as admin_email
    from exhibitions.tenants tn) t),'[]');
end $$;

create or replace function exhibitions.set_tenant_status(p_tenant_id uuid, p_status text, p_subscription_status text default null, p_expires date default null)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
begin
  if not exhibitions.is_platform_admin() then raise exception 'غير مصرّح'; end if;
  update exhibitions.tenants set status=coalesce(p_status,status),
    subscription_status=coalesce(p_subscription_status,subscription_status),
    subscription_expires_at=coalesce(p_expires,subscription_expires_at) where id=p_tenant_id;
end $$;

create or replace function exhibitions.update_tenant_branding(p_tenant_id uuid, p_brand_name text, p_logo_url text default null, p_primary_color text default null)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
begin
  if not (exhibitions.is_platform_admin() or (exhibitions.is_admin() and p_tenant_id=exhibitions.current_tenant_id())) then
    raise exception 'غير مصرّح'; end if;
  update exhibitions.tenants set brand_name=coalesce(nullif(p_brand_name,''),brand_name),
    logo_url=coalesce(p_logo_url,logo_url), primary_color=coalesce(nullif(p_primary_color,''),primary_color)
  where id=p_tenant_id;
end $$;

-- is_admin/is_inventory_manager يتحققان من أن اشتراك العميل فعّال (status='active')
create or replace function exhibitions.is_admin()
returns boolean language sql stable security definer set search_path=exhibitions,public as $$
  select exists(select 1 from exhibitions.profiles p join exhibitions.tenants t on t.id=p.tenant_id
    where p.auth_user_id=auth.uid() and p.role='admin' and p.status='active' and t.status='active');
$$;
create or replace function exhibitions.is_inventory_manager()
returns boolean language sql stable security definer set search_path=exhibitions,public as $$
  select exists(select 1 from exhibitions.profiles p join exhibitions.tenants t on t.id=p.tenant_id
    where p.auth_user_id=auth.uid() and p.role='inventory_manager' and p.status='active' and t.status='active');
$$;

grant execute on function exhibitions.create_tenant(text,text,text,text,text,date) to authenticated;
grant execute on function exhibitions.platform_list_tenants() to authenticated;
grant execute on function exhibitions.set_tenant_status(uuid,text,text,date) to authenticated;
grant execute on function exhibitions.update_tenant_branding(uuid,text,text,text) to authenticated;
