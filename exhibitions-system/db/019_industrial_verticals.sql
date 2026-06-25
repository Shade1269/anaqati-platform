-- ============================================================
-- إضافات القطاعات الصناعية | Migration 019
-- نوع فرعي للمصنع (عام/بلاستيك/خشب/معادن) + قوالب البلاستيك +
-- تسجيل الإنتاج والهدر على أوامر الشغل. (حاسبة الوزن للمعادن وحاسبة
-- قص الألواح للخشب في الواجهة فقط.)
-- يصلح أيضًا create_tenant لقبول نوع manufacturing (كان يحوّله إلى retail).
-- ============================================================

alter table exhibitions.tenants
  add column if not exists business_subtype text not null default 'general'
  check (business_subtype in ('general','plastics','wood','metal'));

-- أعمدة الإنتاج/الهدر على أوامر الشغل (للقطاعات كلها، مهمّة للبلاستيك)
alter table exhibitions.mfg_work_orders add column if not exists produced_qty numeric(14,3) not null default 0;
alter table exhibitions.mfg_work_orders add column if not exists scrap_qty numeric(14,3) not null default 0;

-- كثافة المادة (لحساب الوزن في المعادن) — اختياري
alter table exhibitions.mfg_materials add column if not exists density numeric(14,4);

-- قوالب البلاستيك
create table if not exists exhibitions.mfg_molds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references exhibitions.tenants(id) on delete cascade,
  name text not null,
  cavities int not null default 1 check (cavities >= 1),
  product_id uuid references exhibitions.mfg_products(id) on delete set null,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
drop trigger if exists trg_set_tenant on exhibitions.mfg_molds;
create trigger trg_set_tenant before insert on exhibitions.mfg_molds for each row execute function exhibitions._set_tenant();
create index if not exists idx_mfg_molds_tenant on exhibitions.mfg_molds(tenant_id);
alter table exhibitions.mfg_molds enable row level security;
drop policy if exists admin_all on exhibitions.mfg_molds;
create policy admin_all on exhibitions.mfg_molds for all to authenticated
  using (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id());
drop policy if exists mgr_mfg on exhibitions.mfg_molds;
create policy mgr_mfg on exhibitions.mfg_molds for all to authenticated
  using (exhibitions._im_can('can_manage_manufacturing') and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions._im_can('can_manage_manufacturing') and tenant_id=exhibitions.current_tenant_id());
grant select,insert,update,delete on exhibitions.mfg_molds to authenticated;
grant all on exhibitions.mfg_molds to service_role;

-- ---------- RPCs: القوالب ----------
create or replace function exhibitions.mfg_molds_list()
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant();
begin
  return (select coalesce(json_agg(json_build_object('id',m.id,'name',m.name,'cavities',m.cavities,'product_id',m.product_id,
     'product',p.name,'note',m.note,'is_active',m.is_active) order by m.name),'[]')
    from exhibitions.mfg_molds m left join exhibitions.mfg_products p on p.id=m.product_id where m.tenant_id=v_t);
end $$;

create or replace function exhibitions.mfg_mold_set(p_id uuid, p_name text, p_cavities int, p_product_id uuid, p_note text, p_active boolean default true)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant(); v_id uuid;
begin
  if p_id is null then
    insert into exhibitions.mfg_molds(tenant_id,name,cavities,product_id,note,is_active)
      values(v_t,p_name,greatest(coalesce(p_cavities,1),1),p_product_id,p_note,coalesce(p_active,true)) returning id into v_id;
  else
    update exhibitions.mfg_molds set name=p_name,cavities=greatest(coalesce(p_cavities,1),1),product_id=p_product_id,note=p_note,is_active=coalesce(p_active,true)
      where id=p_id and tenant_id=v_t returning id into v_id;
    if v_id is null then raise exception 'القالب غير موجود'; end if;
  end if; return v_id;
end $$;

create or replace function exhibitions.mfg_mold_delete(p_id uuid)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant();
begin delete from exhibitions.mfg_molds where id=p_id and tenant_id=v_t; end $$;

-- ---------- RPC: تسجيل الإنتاج/الهدر ----------
create or replace function exhibitions.mfg_wo_record_output(p_id uuid, p_produced numeric, p_scrap numeric)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant(); o exhibitions.mfg_work_orders;
begin
  select * into o from exhibitions.mfg_work_orders where id=p_id and tenant_id=v_t;
  if not found then raise exception 'الأمر غير موجود'; end if;
  if o.status in ('invoiced','cancelled','quote') then raise exception 'الأمر غير قابل للتحديث'; end if;
  update exhibitions.mfg_work_orders set produced_qty=greatest(coalesce(p_produced,0),0), scrap_qty=greatest(coalesce(p_scrap,0),0) where id=p_id;
end $$;

grant execute on function exhibitions.mfg_molds_list() to authenticated;
grant execute on function exhibitions.mfg_mold_set(uuid,text,int,uuid,text,boolean) to authenticated;
grant execute on function exhibitions.mfg_mold_delete(uuid) to authenticated;
grant execute on function exhibitions.mfg_wo_record_output(uuid,numeric,numeric) to authenticated;

-- ---------- مادة: كثافة (set) — توسيع mfg_material_set ----------
create or replace function exhibitions.mfg_material_set(p_id uuid, p_name text, p_unit text, p_reorder numeric, p_cost numeric, p_active boolean default true, p_density numeric default null)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant(); v_id uuid;
begin
  if p_id is null then
    insert into exhibitions.mfg_materials(tenant_id,name,unit,reorder_level,cost_per_unit,is_active,density)
      values(v_t,p_name,coalesce(nullif(p_unit,''),'قطعة'),coalesce(p_reorder,0),coalesce(p_cost,0),coalesce(p_active,true),p_density) returning id into v_id;
  else
    update exhibitions.mfg_materials set name=p_name,unit=coalesce(nullif(p_unit,''),'قطعة'),reorder_level=coalesce(p_reorder,0),
      cost_per_unit=coalesce(p_cost,cost_per_unit),is_active=coalesce(p_active,true),density=p_density where id=p_id and tenant_id=v_t returning id into v_id;
    if v_id is null then raise exception 'المادة غير موجودة'; end if;
  end if; return v_id;
end $$;
grant execute on function exhibitions.mfg_material_set(uuid,text,text,numeric,numeric,boolean,numeric) to authenticated;

-- materials_list يُرجِع density أيضًا
create or replace function exhibitions.mfg_materials_list(p_low_only boolean default false)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant();
begin
  return (select coalesce(json_agg(row_to_json(x) order by (x.current_qty<=x.reorder_level) desc, x.name),'[]') from (
    select m.id,m.name,m.unit,m.current_qty,m.reorder_level,m.cost_per_unit,m.is_active,m.density,(m.current_qty<=m.reorder_level) as is_low
    from exhibitions.mfg_materials m where m.tenant_id=v_t and (not p_low_only or m.current_qty<=m.reorder_level)) x);
end $$;
grant execute on function exhibitions.mfg_materials_list(boolean) to authenticated;

-- wo_detail يُرجِع produced/scrap
create or replace function exhibitions.mfg_wo_detail(p_id uuid)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant(); o exhibitions.mfg_work_orders;
begin
  select * into o from exhibitions.mfg_work_orders where id=p_id and tenant_id=v_t;
  if not found then raise exception 'الأمر غير موجود'; end if;
  return json_build_object(
    'id',o.id,'wo_no',o.wo_no,'product',o.product_name,'product_id',o.product_id,'qty',o.qty,'customer',o.customer_name,'status',o.status,'markup_pct',o.markup_pct,'note',o.note,
    'produced_qty',o.produced_qty,'scrap_qty',o.scrap_qty,
    'est',json_build_object('material',o.est_material,'labor',o.est_labor,'overhead',o.est_overhead,'total',o.est_total,'price',o.price),
    'actual',json_build_object('material',o.actual_material,'labor',o.actual_labor,'overhead',o.actual_overhead,'total',(o.actual_material+o.actual_labor+o.actual_overhead)),
    'materials',(select coalesce(json_agg(json_build_object('name',x.name_snapshot,'qty',x.qty,'cost',x.line_cost) order by x.created_at),'[]') from exhibitions.mfg_wo_materials x where x.work_order_id=o.id),
    'labor',(select coalesce(json_agg(json_build_object('operation',l.operation,'minutes',l.minutes,'labor',l.labor_cost,'overhead',l.overhead_cost) order by l.created_at),'[]') from exhibitions.mfg_wo_labor l where l.work_order_id=o.id));
end $$;
grant execute on function exhibitions.mfg_wo_detail(uuid) to authenticated;

-- ============================================================
-- create_tenant: قبول manufacturing + business_subtype
-- ============================================================
drop function if exists exhibitions.create_tenant(text,text,text,text,text,date,text);
create or replace function exhibitions.create_tenant(
  p_name text, p_admin_email text, p_admin_password text,
  p_brand_name text default null, p_primary_color text default '#C9A24B',
  p_subscription_expires date default null, p_business_type text default 'retail', p_business_subtype text default 'general')
returns json language plpgsql security definer set search_path=exhibitions,public,extensions as $$
declare v_t uuid; v_uid uuid; v_pid uuid; v_email text := lower(trim(p_admin_email));
        v_btype text := case when p_business_type in ('restaurant','manufacturing') then p_business_type else 'retail' end;
        v_sub text := case when p_business_subtype in ('plastics','wood','metal') then p_business_subtype else 'general' end;
begin
  if not exhibitions.is_platform_admin() then raise exception 'غير مصرّح'; end if;
  if exists(select 1 from auth.users where email=v_email) then raise exception 'البريد الإلكتروني مستخدم مسبقًا'; end if;
  insert into exhibitions.tenants(name,brand_name,primary_color,subscription_expires_at,business_type,business_subtype)
    values(p_name, coalesce(nullif(p_brand_name,''),p_name), coalesce(p_primary_color,'#C9A24B'), p_subscription_expires, v_btype, v_sub) returning id into v_t;
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
  return json_build_object('tenant_id',v_t,'admin_email',v_email,'profile_id',v_pid,'business_type',v_btype,'business_subtype',v_sub);
end $$;
grant execute on function exhibitions.create_tenant(text,text,text,text,text,date,text,text) to authenticated;

-- my_profile + platform_list_tenants يشملان business_subtype
create or replace function exhibitions.my_profile()
returns json language sql stable security definer set search_path=exhibitions,public as $$
  select json_build_object(
    'id',pr.id,'full_name',pr.full_name,'role',pr.role,'status',pr.status,'tenant_id',pr.tenant_id,
    'is_platform_admin', exhibitions.is_platform_admin(),
    'tenant', (select row_to_json(t) from (select id,name,brand_name,logo_url,primary_color,status,subscription_status,subscription_expires_at,business_type,business_subtype from exhibitions.tenants where id=pr.tenant_id) t),
    'permissions',(select row_to_json(x) from (
       select can_add_stock,can_approve_requests,can_issue_transfers,can_issue_wholesale,can_receive_returns,
              can_manage_employees,can_manage_store,can_manage_restaurant,can_manage_market,can_manage_manufacturing
         from exhibitions.im_permissions where profile_id=pr.id) x)
  ) from exhibitions.profiles pr where pr.auth_user_id=auth.uid();
$$;

create or replace function exhibitions.platform_list_tenants()
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
begin
  if not exhibitions.is_platform_admin() then raise exception 'غير مصرّح'; end if;
  return coalesce((select json_agg(row_to_json(t) order by t.created_at) from (
    select tn.id,tn.name,tn.brand_name,tn.primary_color,tn.status,tn.subscription_status,tn.subscription_expires_at,tn.created_at,
      tn.business_type,tn.business_subtype,
      (select count(*) from exhibitions.profiles p where p.tenant_id=tn.id and p.role='employee') as employees,
      (select count(*) from exhibitions.branches b where b.tenant_id=tn.id) as branches,
      (select coalesce(sum(total_sar),0) from exhibitions.sales s where s.tenant_id=tn.id and s.status='completed') as sales_total,
      (select u.email from auth.users u join exhibitions.profiles pa on pa.auth_user_id=u.id
        where pa.tenant_id=tn.id and pa.role='admin' order by pa.created_at limit 1) as admin_email
    from exhibitions.tenants tn) t),'[]');
end $$;
