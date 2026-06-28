-- ============================================================
-- قطاع البقالة/السوبر ماركت (vertical كامل) | Migration 056
-- نوع نشاط grocery + كاشير باركود يبيع من مخزون الفرع/المتجر + لوحة بقالة
-- + دعم الكميات الكسرية (كيلو) في المبيعات.
-- ============================================================

alter table exhibitions.tenants drop constraint if exists tenants_business_type_check;
alter table exhibitions.tenants add constraint tenants_business_type_check
  check (business_type = any (array['retail','restaurant','manufacturing','distribution','grocery']));

create or replace function exhibitions.create_tenant(p_name text, p_admin_email text, p_admin_password text, p_brand_name text DEFAULT NULL::text, p_primary_color text DEFAULT '#C9A24B'::text, p_subscription_expires date DEFAULT NULL::date, p_business_type text DEFAULT 'retail'::text, p_business_subtype text DEFAULT 'general'::text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'exhibitions', 'public', 'extensions'
AS $function$
declare v_t uuid; v_uid uuid; v_pid uuid; v_email text := lower(trim(p_admin_email));
        v_btype text := case when p_business_type in ('restaurant','manufacturing','distribution','grocery') then p_business_type else 'retail' end;
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
end $function$;

-- دعم الكميات الكسرية في المبيعات (كيلو/لحوم/خضار)
alter table exhibitions.sale_items alter column qty type numeric(14,3);

-- بحث بالباركود (كود المنتج أو باركود وحدة)
create or replace function exhibitions.pos_lookup(p_code text)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid; v_code text := trim(p_code); v_row record;
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_manage_store')) then raise exception 'غير مصرّح'; end if;
  v_t := exhibitions.current_tenant_id();
  select p.id, p.name, p.product_code, p.base_unit, p.sale_price_ref, null::uuid as uom_id, 1::numeric as factor
    into v_row from exhibitions.products p
    where p.tenant_id=v_t and p.is_active and p.product_code=v_code limit 1;
  if v_row.id is null then
    select p.id, p.name, p.product_code, p.base_unit,
           round(p.sale_price_ref*u.factor,2) as sale_price_ref, u.id as uom_id, u.factor
      into v_row from exhibitions.product_uoms u
      join exhibitions.products p on p.id=u.product_id
      where u.tenant_id=v_t and p.is_active and u.barcode=v_code limit 1;
  end if;
  if v_row.id is null then return null; end if;
  return row_to_json(v_row);
end $$;

-- بيع الكاشير من مخزون الفرع/المتجر (يسجّل الإيراد+التكلفة عبر مُحفّز sale_items)
create or replace function exhibitions.pos_sale(p_branch_id uuid, p_payment_method text, p_items jsonb)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid; v_actor uuid; v_sale uuid; r jsonb; v_total numeric:=0;
        v_pid uuid; v_qty numeric; v_price numeric; v_uom uuid; v_factor numeric; v_base numeric; v_cost numeric;
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_manage_store')) then raise exception 'غير مصرّح'; end if;
  v_t := exhibitions.current_tenant_id(); v_actor := exhibitions.current_profile_id();
  if not exists(select 1 from exhibitions.branches where id=p_branch_id and tenant_id=v_t) then
    raise exception 'الفرع غير موجود'; end if;
  insert into exhibitions.sales(branch_id,employee_id,payment_method,total_sar,status)
    values(p_branch_id,v_actor,p_payment_method::exhibitions.payment_method,0,'completed') returning id into v_sale;
  for r in select * from jsonb_array_elements(p_items) loop
    v_pid:=(r->>'product_id')::uuid; v_qty:=(r->>'qty')::numeric; v_price:=(r->>'unit_price')::numeric;
    v_uom:=nullif(r->>'uom_id','')::uuid;
    if not exists(select 1 from exhibitions.products where id=v_pid and tenant_id=v_t) then raise exception 'منتج غير صحيح'; end if;
    if v_qty is null or v_qty<=0 then raise exception 'كمية غير صحيحة'; end if;
    if v_uom is not null then
      select factor into v_factor from exhibitions.product_uoms where id=v_uom and product_id=v_pid and tenant_id=v_t;
      if v_factor is null then v_factor:=1; end if;
    else v_factor:=1; end if;
    v_base := v_qty * v_factor;
    select cost_price_sar into v_cost from exhibitions.products where id=v_pid;
    insert into exhibitions.sale_items(sale_id,product_id,qty,unit_sale_price_sar,unit_cost_snapshot_sar)
      values(v_sale,v_pid,v_base, round(v_qty*v_price/nullif(v_base,0),4), coalesce(v_cost,0));
    perform exhibitions._move_stock(v_pid,v_base,'branch',p_branch_id,null,null,'sale','sales',v_sale,v_actor);
    perform exhibitions._consume_fefo(v_pid,'branch',p_branch_id,v_base);
    v_total := v_total + (v_qty*v_price);
  end loop;
  update exhibitions.sales set total_sar=v_total where id=v_sale;
  return json_build_object('sale_id',v_sale,'total',v_total);
end $$;

-- لوحة البقالة
create or replace function exhibitions.grocery_dashboard()
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid;
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  v_t := exhibitions.current_tenant_id();
  return json_build_object(
    'sales_today', coalesce((select sum(si.qty*si.unit_sale_price_sar)
        from exhibitions.sale_items si join exhibitions.sales sa on sa.id=si.sale_id
        join exhibitions.branches b on b.id=sa.branch_id
        where b.tenant_id=v_t and (sa.created_at at time zone 'Asia/Damascus')::date = (now() at time zone 'Asia/Damascus')::date),0),
    'tx_today', coalesce((select count(distinct sa.id)
        from exhibitions.sales sa join exhibitions.branches b on b.id=sa.branch_id
        where b.tenant_id=v_t and (sa.created_at at time zone 'Asia/Damascus')::date = (now() at time zone 'Asia/Damascus')::date),0),
    'low_stock', coalesce((select count(*) from exhibitions.products p where p.tenant_id=v_t and p.is_active and p.reorder_level>0
        and coalesce((select sum(i.quantity) from exhibitions.inventory i where i.product_id=p.id),0) <= p.reorder_level),0),
    'expiring', coalesce((select count(*) from exhibitions.stock_batches sb where sb.tenant_id=v_t and sb.qty>0
        and sb.expiry_date is not null and sb.expiry_date <= current_date + 30),0),
    'products', coalesce((select count(*) from exhibitions.products where tenant_id=v_t and is_active),0),
    'top_products', coalesce((select json_agg(x order by x.qty desc) from (
        select p.name, sum(si.qty) as qty, sum(si.qty*si.unit_sale_price_sar) as revenue
        from exhibitions.sale_items si join exhibitions.sales sa on sa.id=si.sale_id
        join exhibitions.branches b on b.id=sa.branch_id
        join exhibitions.products p on p.id=si.product_id
        where b.tenant_id=v_t and sa.created_at >= date_trunc('month', now())
        group by p.name order by qty desc limit 5) x),'[]'::json)
  );
end $$;

grant execute on function exhibitions.pos_lookup(text) to authenticated;
grant execute on function exhibitions.pos_sale(uuid, text, jsonb) to authenticated;
grant execute on function exhibitions.grocery_dashboard() to authenticated;
