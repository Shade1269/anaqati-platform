-- ============================================================
-- المرحلة 2: المتجر الإلكتروني لكل عميل | Migration 012
-- ============================================================

-- توسعة إعدادات المتجر على tenants
alter table exhibitions.tenants add column if not exists store_enabled boolean not null default false;
alter table exhibitions.tenants add column if not exists store_description text;
alter table exhibitions.tenants add column if not exists store_whatsapp text;
alter table exhibitions.tenants add column if not exists delivery_fee numeric(14,2) not null default 0;
alter table exhibitions.tenants add column if not exists cod_enabled boolean not null default true;

-- slug فريد لكل عميل (رابط المتجر) — تعبئة الناقص
update exhibitions.tenants set slug = 'store-'||substr(id::text,1,8) where slug is null or slug='';
create unique index if not exists tenants_slug_uniq on exhibitions.tenants(slug);

-- توسعة المنتجات للمتجر
alter table exhibitions.products add column if not exists online_enabled boolean not null default false;
alter table exhibitions.products add column if not exists online_price numeric(14,2);
alter table exhibitions.products add column if not exists image_url text;
alter table exhibitions.products add column if not exists description text;

-- حساب إيرادات المتجر الإلكتروني (دليل حسابات عام)
insert into exhibitions.accounts(code,name,type,sort) values ('4030','إيرادات المتجر الإلكتروني','revenue',115)
  on conflict (code) do nothing;

-- جداول الطلبات
create sequence if not exists exhibitions.online_order_seq;
create table if not exists exhibitions.online_orders (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references exhibitions.tenants(id) on delete cascade,
  order_no       text not null default ('ON-'||lpad(nextval('exhibitions.online_order_seq')::text,6,'0')),
  customer_name  text not null,
  customer_phone text not null,
  address        text,
  payment_method exhibitions.payment_method not null default 'cash',
  status         text not null default 'new' check (status in ('new','confirmed','fulfilled','cancelled')),
  subtotal_sar   numeric(14,2) not null default 0,
  delivery_fee_sar numeric(14,2) not null default 0,
  total_sar      numeric(14,2) not null default 0,
  notes          text,
  fulfilled_by   uuid references exhibitions.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create table if not exists exhibitions.online_order_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references exhibitions.tenants(id) on delete cascade,
  order_id    uuid not null references exhibitions.online_orders(id) on delete cascade,
  product_id  uuid not null references exhibitions.products(id) on delete restrict,
  qty         integer not null check (qty>0),
  unit_price_sar numeric(14,2) not null
);
create index if not exists idx_oo_tenant on exhibitions.online_orders(tenant_id);
create index if not exists idx_oo_status on exhibitions.online_orders(status);
create index if not exists idx_ooi_order on exhibitions.online_order_items(order_id);

-- ختم تلقائي + RLS (إدارة الأدمن فقط؛ العميل العام عبر RPCs)
drop trigger if exists trg_set_tenant on exhibitions.online_orders;
create trigger trg_set_tenant before insert on exhibitions.online_orders for each row execute function exhibitions._set_tenant();
drop trigger if exists trg_set_tenant on exhibitions.online_order_items;
create trigger trg_set_tenant before insert on exhibitions.online_order_items for each row execute function exhibitions._set_tenant();
alter table exhibitions.online_orders enable row level security;
alter table exhibitions.online_order_items enable row level security;
drop policy if exists admin_all on exhibitions.online_orders;
create policy admin_all on exhibitions.online_orders for all to authenticated
  using (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id());
drop policy if exists admin_all on exhibitions.online_order_items;
create policy admin_all on exhibitions.online_order_items for all to authenticated
  using (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id());
grant all on exhibitions.online_orders, exhibitions.online_order_items to service_role;
grant select,insert,update on exhibitions.online_orders, exhibitions.online_order_items to authenticated;

-- ============================================================
-- RPCs عامة للمتجر (anon) — تُحدّد العميل عبر slug
-- ============================================================
create or replace function exhibitions.store_info(p_slug text)
returns json language sql stable security definer set search_path=exhibitions,public as $$
  select case when t.store_enabled then json_build_object(
    'tenant_id',t.id,'name',t.name,'brand_name',coalesce(t.brand_name,t.name),
    'logo_url',t.logo_url,'primary_color',t.primary_color,'description',t.store_description,
    'whatsapp',t.store_whatsapp,'delivery_fee',t.delivery_fee,'cod_enabled',t.cod_enabled,'slug',t.slug)
   else null end
  from exhibitions.tenants t where t.slug=p_slug;
$$;

create or replace function exhibitions.store_list_products(p_slug text)
returns json language sql stable security definer set search_path=exhibitions,public as $$
  select coalesce(json_agg(json_build_object(
     'id',p.id,'name',p.name,'code',p.product_code,'description',p.description,'image_url',p.image_url,
     'price',coalesce(p.online_price,p.sale_price_ref),
     'in_stock',(select coalesce(sum(i.quantity),0) from exhibitions.inventory i
        where i.product_id=p.id and i.location_type='warehouse')
   ) order by p.name),'[]')
  from exhibitions.products p
  join exhibitions.tenants t on t.id=p.tenant_id
  where t.slug=p_slug and t.store_enabled and p.is_active and p.online_enabled;
$$;

create or replace function exhibitions.store_create_order(
  p_slug text, p_customer_name text, p_customer_phone text, p_address text,
  p_payment_method text, p_items jsonb)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid; v_fee numeric; v_enabled boolean; v_order uuid; r jsonb; v_pid uuid; v_qty int; v_price numeric; v_sub numeric:=0; v_no text;
begin
  select id, delivery_fee, store_enabled into v_t, v_fee, v_enabled from exhibitions.tenants where slug=p_slug;
  if v_t is null or not v_enabled then raise exception 'المتجر غير متاح'; end if;
  if p_customer_name is null or p_customer_phone is null then raise exception 'الاسم والجوال مطلوبان'; end if;
  if p_items is null or jsonb_array_length(p_items)=0 then raise exception 'السلة فارغة'; end if;
  perform set_config('exhibitions.current_tenant', v_t::text, true);
  insert into exhibitions.online_orders(tenant_id,customer_name,customer_phone,address,payment_method,delivery_fee_sar,status)
    values(v_t,p_customer_name,p_customer_phone,p_address,coalesce(p_payment_method,'cash')::exhibitions.payment_method,coalesce(v_fee,0),'new')
    returning id, order_no into v_order, v_no;
  for r in select * from jsonb_array_elements(p_items) loop
    v_pid:=(r->>'product_id')::uuid; v_qty:=(r->>'qty')::int;
    select coalesce(online_price,sale_price_ref) into v_price from exhibitions.products
      where id=v_pid and tenant_id=v_t and is_active and online_enabled;
    if v_price is null then raise exception 'منتج غير متاح'; end if;
    insert into exhibitions.online_order_items(tenant_id,order_id,product_id,qty,unit_price_sar) values(v_t,v_order,v_pid,v_qty,v_price);
    v_sub := v_sub + v_qty*v_price;
  end loop;
  update exhibitions.online_orders set subtotal_sar=v_sub, total_sar=v_sub+coalesce(v_fee,0) where id=v_order;
  -- إشعار أدمن العميل
  insert into exhibitions.notifications(tenant_id,recipient_id,type,title,body,ref_table,ref_id)
    select v_t, id,'online_order','طلب متجر جديد','طلب جديد رقم '||v_no||' بقيمة '||(v_sub+coalesce(v_fee,0))::text||' ر.س','online_orders',v_order
    from exhibitions.profiles where tenant_id=v_t and role='admin' and status='active';
  return json_build_object('order_id',v_order,'order_no',v_no,'total',v_sub+coalesce(v_fee,0));
end $$;

-- ============================================================
-- RPCs للأدمن: حالة الطلب + التنفيذ (خصم مخزون + محاسبة)
-- ============================================================
create or replace function exhibitions.set_online_order_status(p_order_id uuid, p_status text)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  update exhibitions.online_orders set status=p_status
    where id=p_order_id and tenant_id=exhibitions.current_tenant_id() and status in ('new','confirmed');
end $$;

create or replace function exhibitions.fulfill_online_order(p_order_id uuid, p_warehouse_id uuid)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid; v_actor uuid; v_pm exhibitions.payment_method; v_fee numeric; v_cash text; rec record; v_cost numeric; v_rev numeric:=0; v_cogs numeric:=0; v_total numeric;
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  v_t := exhibitions.current_tenant_id(); v_actor := exhibitions.current_profile_id();
  select payment_method, delivery_fee_sar into v_pm, v_fee from exhibitions.online_orders where id=p_order_id and tenant_id=v_t and status in ('new','confirmed');
  if not found then raise exception 'الطلب غير موجود أو مُنفّذ مسبقًا'; end if;
  for rec in select product_id, qty, unit_price_sar from exhibitions.online_order_items where order_id=p_order_id and tenant_id=v_t loop
    select cost_price_sar into v_cost from exhibitions.products where id=rec.product_id;
    perform exhibitions._move_stock(rec.product_id,rec.qty,'warehouse',p_warehouse_id,null,null,'sale','online_orders',p_order_id,v_actor);
    v_rev := v_rev + rec.qty*rec.unit_price_sar;
    v_cogs := v_cogs + rec.qty*coalesce(v_cost,0);
  end loop;
  v_total := v_rev + coalesce(v_fee,0);
  v_cash := case when v_pm='card' then '1020' else '1010' end;
  -- الكاش = إجمالي الطلب (منتجات + توصيل) ؛ الإيراد يشمل رسوم التوصيل
  perform exhibitions._post(current_date,'طلب متجر إلكتروني','online_orders',p_order_id,
    jsonb_build_array(
      jsonb_build_object('account',v_cash,'debit',v_total,'credit',0),
      jsonb_build_object('account','4030','debit',0,'credit',v_total),
      jsonb_build_object('account','5010','debit',v_cogs,'credit',0),
      jsonb_build_object('account','1100','debit',0,'credit',v_cogs)));
  update exhibitions.online_orders set status='fulfilled', fulfilled_by=v_actor where id=p_order_id;
  return json_build_object('order_id',p_order_id,'revenue',v_total,'cogs',v_cogs);
end $$;

grant execute on function exhibitions.store_info(text) to anon, authenticated;
grant execute on function exhibitions.store_list_products(text) to anon, authenticated;
grant execute on function exhibitions.store_create_order(text,text,text,text,text,jsonb) to anon, authenticated;
grant execute on function exhibitions.set_online_order_status(uuid,text) to authenticated;
grant execute on function exhibitions.fulfill_online_order(uuid,uuid) to authenticated;
