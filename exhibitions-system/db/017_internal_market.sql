-- ============================================================
-- السوق الداخلي B2B بين المشتركين | Migration 017
-- كل مشترك يعرض منتجات للبيع لباقي المشتركين، ويطلب من غيره.
-- يكسر العزل عمدًا للمعروضات النشطة فقط (عبر دوال SECURITY DEFINER)؛
-- بقية بيانات كل مشترك تبقى معزولة. الطلب يقيّد محاسبيًا في دفترَي
-- الطرفين عند التنفيذ (بائع: إيراد؛ مشتري: مخزون).
-- ============================================================

-- حسابات جديدة بالدليل العام
insert into exhibitions.accounts(code,name,type,sort) values
  ('4050','إيرادات السوق الداخلي','revenue',117),
  ('1300','ذمم العملاء (السوق)','asset',45)
  on conflict (code) do nothing;

-- تفويض إدارة السوق للمدير
alter table exhibitions.im_permissions
  add column if not exists can_manage_market boolean not null default false;

create sequence if not exists exhibitions.market_order_seq;

-- معروضات السوق (لكل بائع) — معزولة بالعميل، التصفّح عبر دالة
create table if not exists exhibitions.market_listings (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references exhibitions.tenants(id) on delete cascade,
  name          text not null,
  category      text,
  description   text,
  unit          text not null default 'قطعة',
  price_sar     numeric(14,2) not null default 0,
  min_order_qty numeric(14,3) not null default 1,
  image_url     text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

drop trigger if exists trg_set_tenant on exhibitions.market_listings;
create trigger trg_set_tenant before insert on exhibitions.market_listings for each row execute function exhibitions._set_tenant();
create index if not exists idx_market_listings_tenant on exhibitions.market_listings(tenant_id);
create index if not exists idx_market_listings_active on exhibitions.market_listings(is_active);
alter table exhibitions.market_listings enable row level security;
drop policy if exists admin_all on exhibitions.market_listings;
create policy admin_all on exhibitions.market_listings for all to authenticated
  using (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id())
  with check (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id());
drop policy if exists mgr_market on exhibitions.market_listings;
create policy mgr_market on exhibitions.market_listings for all to authenticated
  using (exhibitions._im_can('can_manage_market') and tenant_id=exhibitions.current_tenant_id())
  with check (exhibitions._im_can('can_manage_market') and tenant_id=exhibitions.current_tenant_id());
grant select,insert,update,delete on exhibitions.market_listings to authenticated;
grant all on exhibitions.market_listings to service_role;

-- طلبات السوق (بين بائع ومشتري) — وصول عبر الدوال فقط
create table if not exists exhibitions.market_orders (
  id               uuid primary key default gen_random_uuid(),
  seller_tenant_id uuid not null references exhibitions.tenants(id) on delete cascade,
  buyer_tenant_id  uuid not null references exhibitions.tenants(id) on delete cascade,
  order_no         text not null default ('MK-'||lpad(nextval('exhibitions.market_order_seq')::text,6,'0')),
  status           text not null default 'new' check (status in ('new','confirmed','fulfilled','cancelled')),
  payment_method   text not null default 'cash' check (payment_method in ('cash','credit')),
  total_sar        numeric(14,2) not null default 0,
  note             text,
  created_by       uuid references exhibitions.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  fulfilled_at     timestamptz
);
create table if not exists exhibitions.market_order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references exhibitions.market_orders(id) on delete cascade,
  listing_id    uuid references exhibitions.market_listings(id) on delete set null,
  name_snapshot text not null,
  unit          text,
  unit_price_sar numeric(14,2) not null,
  qty           numeric(14,3) not null check (qty > 0),
  line_total_sar numeric(14,2) not null
);
create index if not exists idx_market_orders_seller on exhibitions.market_orders(seller_tenant_id);
create index if not exists idx_market_orders_buyer on exhibitions.market_orders(buyer_tenant_id);
create index if not exists idx_market_order_items_order on exhibitions.market_order_items(order_id);
alter table exhibitions.market_orders enable row level security;
alter table exhibitions.market_order_items enable row level security;
grant all on exhibitions.market_orders, exhibitions.market_order_items to service_role;
-- لا سياسات للمستخدمين: الوصول عبر دوال SECURITY DEFINER فقط

-- ============================================================
-- سياق السوق: يتحقق من الصلاحية ويعيد عميل المشترك الحالي
-- ============================================================
create or replace function exhibitions._market_tenant() returns uuid
language plpgsql stable security definer set search_path=exhibitions,public as $$
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_manage_market')) then
    raise exception 'غير مصرّح';
  end if;
  return exhibitions.current_tenant_id();
end $$;
revoke execute on function exhibitions._market_tenant() from public, anon, authenticated;

-- ============================================================
-- إدارة معروضاتي
-- ============================================================
create or replace function exhibitions.market_my_listings()
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._market_tenant();
begin
  return (select coalesce(json_agg(json_build_object(
     'id',l.id,'name',l.name,'category',l.category,'description',l.description,'unit',l.unit,
     'price',l.price_sar,'min_order_qty',l.min_order_qty,'image_url',l.image_url,'is_active',l.is_active) order by l.name),'[]')
   from exhibitions.market_listings l where l.tenant_id=v_t);
end $$;

create or replace function exhibitions.market_set_listing(
  p_id uuid, p_name text, p_category text, p_description text, p_unit text,
  p_price numeric, p_min_qty numeric, p_image_url text, p_active boolean default true)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._market_tenant(); v_id uuid;
begin
  if p_id is null then
    insert into exhibitions.market_listings(tenant_id,name,category,description,unit,price_sar,min_order_qty,image_url,is_active)
      values(v_t,p_name,nullif(p_category,''),p_description,coalesce(nullif(p_unit,''),'قطعة'),coalesce(p_price,0),greatest(coalesce(p_min_qty,1),0.001),p_image_url,coalesce(p_active,true))
      returning id into v_id;
  else
    update exhibitions.market_listings set name=p_name, category=nullif(p_category,''), description=p_description,
      unit=coalesce(nullif(p_unit,''),'قطعة'), price_sar=coalesce(p_price,0), min_order_qty=greatest(coalesce(p_min_qty,1),0.001),
      image_url=p_image_url, is_active=coalesce(p_active,true)
      where id=p_id and tenant_id=v_t returning id into v_id;
    if v_id is null then raise exception 'المنتج غير موجود'; end if;
  end if;
  return v_id;
end $$;

create or replace function exhibitions.market_delete_listing(p_id uuid)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._market_tenant();
begin
  delete from exhibitions.market_listings where id=p_id and tenant_id=v_t;
end $$;

-- ============================================================
-- تصفّح السوق (كل المشتركين) — يستثني عميلي
-- ============================================================
create or replace function exhibitions.market_browse(p_category text default null)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._market_tenant();
begin
  return (select coalesce(json_agg(json_build_object(
     'id',l.id,'name',l.name,'category',l.category,'description',l.description,'unit',l.unit,
     'price',l.price_sar,'min_order_qty',l.min_order_qty,'image_url',l.image_url,
     'seller_tenant_id',l.tenant_id,'seller_name',coalesce(t.brand_name,t.name)) order by l.category nulls last, l.name),'[]')
   from exhibitions.market_listings l
   join exhibitions.tenants t on t.id=l.tenant_id
   where l.is_active and t.status='active' and l.tenant_id<>v_t
     and (p_category is null or p_category='' or l.category=p_category));
end $$;

-- ============================================================
-- إنشاء طلب من المشتري إلى بائع واحد
-- ============================================================
create or replace function exhibitions.market_place_order(
  p_seller_tenant uuid, p_items jsonb, p_payment_method text default 'cash', p_note text default null)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_buyer uuid := exhibitions._market_tenant(); v_actor uuid := exhibitions.current_profile_id();
        v_order uuid; v_no text; r jsonb; v_l exhibitions.market_listings; v_qty numeric; v_total numeric:=0; v_pm text;
begin
  if v_buyer = p_seller_tenant then raise exception 'لا يمكنك الطلب من نفسك'; end if;
  if p_items is null or jsonb_array_length(p_items)=0 then raise exception 'السلة فارغة'; end if;
  v_pm := case when p_payment_method='credit' then 'credit' else 'cash' end;
  insert into exhibitions.market_orders(seller_tenant_id,buyer_tenant_id,payment_method,status,note,created_by)
    values(p_seller_tenant,v_buyer,v_pm,'new',p_note,v_actor) returning id, order_no into v_order, v_no;
  for r in select * from jsonb_array_elements(p_items) loop
    select * into v_l from exhibitions.market_listings
      where id=(r->>'listing_id')::uuid and tenant_id=p_seller_tenant and is_active;
    if not found then raise exception 'منتج غير متاح'; end if;
    v_qty := greatest(coalesce((r->>'qty')::numeric,0), v_l.min_order_qty);
    insert into exhibitions.market_order_items(order_id,listing_id,name_snapshot,unit,unit_price_sar,qty,line_total_sar)
      values(v_order,v_l.id,v_l.name,v_l.unit,v_l.price_sar,v_qty,v_qty*v_l.price_sar);
    v_total := v_total + v_qty*v_l.price_sar;
  end loop;
  update exhibitions.market_orders set total_sar=v_total where id=v_order;
  -- إشعار أدمن البائع
  insert into exhibitions.notifications(tenant_id,recipient_id,type,title,body,ref_table,ref_id)
    select p_seller_tenant, pr.id,'market_order','طلب سوق جديد','طلب رقم '||v_no||' بقيمة '||v_total::text||' ر.س','market_orders',v_order
    from exhibitions.profiles pr where pr.tenant_id=p_seller_tenant and pr.role='admin' and pr.status='active';
  return json_build_object('order_id',v_order,'order_no',v_no,'total',v_total);
end $$;

-- ============================================================
-- قوائم الطلبات (واردة للبائع / صادرة من المشتري) + التفاصيل
-- ============================================================
create or replace function exhibitions.market_incoming_orders()
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._market_tenant();
begin
  return (select coalesce(json_agg(json_build_object(
     'id',o.id,'order_no',o.order_no,'status',o.status,'payment_method',o.payment_method,'total',o.total_sar,
     'note',o.note,'created_at',o.created_at,'counterparty',coalesce(bt.brand_name,bt.name)) order by o.created_at desc),'[]')
   from exhibitions.market_orders o join exhibitions.tenants bt on bt.id=o.buyer_tenant_id
   where o.seller_tenant_id=v_t);
end $$;

create or replace function exhibitions.market_outgoing_orders()
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._market_tenant();
begin
  return (select coalesce(json_agg(json_build_object(
     'id',o.id,'order_no',o.order_no,'status',o.status,'payment_method',o.payment_method,'total',o.total_sar,
     'note',o.note,'created_at',o.created_at,'counterparty',coalesce(st.brand_name,st.name)) order by o.created_at desc),'[]')
   from exhibitions.market_orders o join exhibitions.tenants st on st.id=o.seller_tenant_id
   where o.buyer_tenant_id=v_t);
end $$;

create or replace function exhibitions.market_order_detail(p_order_id uuid)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._market_tenant(); v_ord exhibitions.market_orders;
begin
  select * into v_ord from exhibitions.market_orders where id=p_order_id;
  if not found or (v_t<>v_ord.seller_tenant_id and v_t<>v_ord.buyer_tenant_id) then raise exception 'الطلب غير موجود'; end if;
  return (select json_build_object(
    'id',v_ord.id,'order_no',v_ord.order_no,'status',v_ord.status,'payment_method',v_ord.payment_method,
    'total',v_ord.total_sar,'note',v_ord.note,'created_at',v_ord.created_at,
    'is_seller',(v_t=v_ord.seller_tenant_id),
    'items',(select coalesce(json_agg(json_build_object('name',i.name_snapshot,'unit',i.unit,'qty',i.qty,'unit_price',i.unit_price_sar,'line_total',i.line_total_sar) order by i.id),'[]')
       from exhibitions.market_order_items i where i.order_id=v_ord.id)));
end $$;

-- ============================================================
-- تغيير حالة الطلب + القيد المحاسبي للطرفين عند التنفيذ
-- ============================================================
create or replace function exhibitions.market_set_order_status(p_order_id uuid, p_status text)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._market_tenant(); v_ord exhibitions.market_orders; v_total numeric;
begin
  select * into v_ord from exhibitions.market_orders where id=p_order_id;
  if not found then raise exception 'الطلب غير موجود'; end if;
  if p_status not in ('confirmed','fulfilled','cancelled') then raise exception 'حالة غير صحيحة'; end if;

  -- صلاحية الانتقال
  if p_status in ('confirmed','fulfilled') then
    if v_t <> v_ord.seller_tenant_id then raise exception 'غير مصرّح'; end if;
  elsif p_status='cancelled' then
    if v_t <> v_ord.seller_tenant_id and not (v_t=v_ord.buyer_tenant_id and v_ord.status='new') then
      raise exception 'غير مصرّح'; end if;
  end if;
  if v_ord.status in ('fulfilled','cancelled') then raise exception 'الطلب مُغلق مسبقًا'; end if;

  if p_status='fulfilled' then
    v_total := v_ord.total_sar;
    -- قيد البائع (السياق الحالي = البائع)
    if v_total > 0 then
      if v_ord.payment_method='credit' then
        perform exhibitions._post(current_date,'مبيعات سوق داخلي','market_orders',v_ord.id,
          jsonb_build_array(jsonb_build_object('account','1300','debit',v_total,'credit',0),
                            jsonb_build_object('account','4050','debit',0,'credit',v_total)));
      else
        perform exhibitions._post(current_date,'مبيعات سوق داخلي','market_orders',v_ord.id,
          jsonb_build_array(jsonb_build_object('account','1010','debit',v_total,'credit',0),
                            jsonb_build_object('account','4050','debit',0,'credit',v_total)));
      end if;
      -- قيد المشتري (تبديل السياق إلى عميل المشتري)
      perform set_config('exhibitions.current_tenant', v_ord.buyer_tenant_id::text, true);
      if v_ord.payment_method='credit' then
        perform exhibitions._post(current_date,'مشتريات سوق داخلي','market_orders',v_ord.id,
          jsonb_build_array(jsonb_build_object('account','1100','debit',v_total,'credit',0),
                            jsonb_build_object('account','2010','debit',0,'credit',v_total)));
      else
        perform exhibitions._post(current_date,'مشتريات سوق داخلي','market_orders',v_ord.id,
          jsonb_build_array(jsonb_build_object('account','1100','debit',v_total,'credit',0),
                            jsonb_build_object('account','1010','debit',0,'credit',v_total)));
      end if;
      perform set_config('exhibitions.current_tenant', v_t::text, true); -- استعادة سياق البائع
    end if;
    update exhibitions.market_orders set status='fulfilled', fulfilled_at=now() where id=v_ord.id;
    insert into exhibitions.notifications(tenant_id,recipient_id,type,title,body,ref_table,ref_id)
      select v_ord.buyer_tenant_id, pr.id,'market_order','تم تنفيذ طلبك','طلب '||v_ord.order_no||' أصبح منفّذًا','market_orders',v_ord.id
      from exhibitions.profiles pr where pr.tenant_id=v_ord.buyer_tenant_id and pr.role='admin' and pr.status='active';
  else
    update exhibitions.market_orders set status=p_status where id=v_ord.id;
  end if;
end $$;

grant execute on function exhibitions.market_my_listings() to authenticated;
grant execute on function exhibitions.market_set_listing(uuid,text,text,text,text,numeric,numeric,text,boolean) to authenticated;
grant execute on function exhibitions.market_delete_listing(uuid) to authenticated;
grant execute on function exhibitions.market_browse(text) to authenticated;
grant execute on function exhibitions.market_place_order(uuid,jsonb,text,text) to authenticated;
grant execute on function exhibitions.market_incoming_orders() to authenticated;
grant execute on function exhibitions.market_outgoing_orders() to authenticated;
grant execute on function exhibitions.market_order_detail(uuid) to authenticated;
grant execute on function exhibitions.market_set_order_status(uuid,text) to authenticated;

-- ============================================================
-- إضافة can_manage_market إلى الصلاحيات + my_profile
-- ============================================================
create or replace function exhibitions.set_im_permissions(
  p_profile_id uuid, p_add_stock boolean, p_approve boolean, p_transfers boolean,
  p_wholesale boolean, p_returns boolean, p_manage_employees boolean default false,
  p_manage_store boolean default false, p_manage_restaurant boolean default false,
  p_manage_market boolean default false)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  if not exists(select 1 from exhibitions.profiles where id=p_profile_id and tenant_id=exhibitions.current_tenant_id()) then raise exception 'المستخدم غير موجود'; end if;
  insert into exhibitions.im_permissions(profile_id,can_add_stock,can_approve_requests,can_issue_transfers,can_issue_wholesale,can_receive_returns,can_manage_employees,can_manage_store,can_manage_restaurant,can_manage_market,updated_at)
    values(p_profile_id,p_add_stock,p_approve,p_transfers,p_wholesale,p_returns,p_manage_employees,p_manage_store,p_manage_restaurant,p_manage_market,now())
  on conflict (profile_id) do update set can_add_stock=excluded.can_add_stock, can_approve_requests=excluded.can_approve_requests,
    can_issue_transfers=excluded.can_issue_transfers, can_issue_wholesale=excluded.can_issue_wholesale, can_receive_returns=excluded.can_receive_returns,
    can_manage_employees=excluded.can_manage_employees, can_manage_store=excluded.can_manage_store,
    can_manage_restaurant=excluded.can_manage_restaurant, can_manage_market=excluded.can_manage_market, updated_at=now();
end $$;
grant execute on function exhibitions.set_im_permissions(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;

create or replace function exhibitions.my_profile()
returns json language sql stable security definer set search_path=exhibitions,public as $$
  select json_build_object(
    'id',pr.id,'full_name',pr.full_name,'role',pr.role,'status',pr.status,
    'tenant_id',pr.tenant_id,
    'is_platform_admin', exhibitions.is_platform_admin(),
    'tenant', (select row_to_json(t) from (
        select id,name,brand_name,logo_url,primary_color,status,subscription_status,subscription_expires_at,business_type
          from exhibitions.tenants where id=pr.tenant_id) t),
    'permissions',(select row_to_json(x) from (
       select can_add_stock,can_approve_requests,can_issue_transfers,can_issue_wholesale,can_receive_returns,
              can_manage_employees,can_manage_store,can_manage_restaurant,can_manage_market
         from exhibitions.im_permissions where profile_id=pr.id) x)
  ) from exhibitions.profiles pr where pr.auth_user_id=auth.uid();
$$;
