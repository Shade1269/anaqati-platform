-- ============================================================
-- التوصيل والمسارات والمندوبون (Van Sales) | Migration 051
-- الفجوة #6 من بحث الأنظمة العالمية (inecta/SimplyDepo/BlueCart).
-- مهم لتوزيع الأغذية ميدانيًا:
--   • مسارات توصيل بترتيب محطات (عملاء).
--   • مخزون الشاحنة = عُهدة المندوب (employee_consignment) الموجودة أصلًا.
--   • تحميل الشاحنة: نقل من المستودع إلى عُهدة المندوب.
--   • تسجيل توصيل/بيع للعميل: خصم من مخزون الشاحنة (FEFO) + إيراد نقدي/شبكة
--     أو دين على العميل (مع فرض حد الائتمان) + قيد تكلفة المبيعات.
-- الصلاحية: المالك أو مدير بصلاحية can_issue_wholesale.
-- ============================================================

create table if not exists exhibitions.delivery_routes (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references exhibitions.tenants(id) on delete cascade,
  name       text not null,
  rep_id     uuid references exhibitions.profiles(id) on delete set null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists exhibitions.route_stops (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references exhibitions.tenants(id) on delete cascade,
  route_id    uuid not null references exhibitions.delivery_routes(id) on delete cascade,
  customer_id uuid not null references exhibitions.customers(id) on delete cascade,
  sequence    int not null default 0,
  unique (route_id, customer_id)
);

create table if not exists exhibitions.deliveries (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references exhibitions.tenants(id) on delete cascade,
  route_id       uuid references exhibitions.delivery_routes(id) on delete set null,
  rep_id         uuid references exhibitions.profiles(id) on delete set null,
  customer_id    uuid references exhibitions.customers(id) on delete set null,
  payment_method text not null check (payment_method in ('cash','card','credit')),
  total_sar      numeric(14,2) not null default 0,
  note           text,
  created_by     uuid references exhibitions.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

create table if not exists exhibitions.delivery_items (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references exhibitions.tenants(id) on delete cascade,
  delivery_id    uuid not null references exhibitions.deliveries(id) on delete cascade,
  product_id     uuid not null references exhibitions.products(id) on delete restrict,
  qty            numeric(14,3) not null,
  unit_price_sar numeric(14,2) not null,
  uom_name       text,
  uom_factor     numeric(14,4) not null default 1,
  base_qty       numeric(14,3) not null
);

do $$
declare t text; tbls text[] := array['delivery_routes','route_stops','deliveries','delivery_items'];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_set_tenant on exhibitions.%I', t);
    execute format('create trigger trg_set_tenant before insert on exhibitions.%I for each row execute function exhibitions._set_tenant()', t);
    execute format('create index if not exists idx_%s_tenant on exhibitions.%I(tenant_id)', t, t);
    execute format('alter table exhibitions.%I enable row level security', t);
    execute format('drop policy if exists admin_all on exhibitions.%I', t);
    execute format('create policy admin_all on exhibitions.%I for all to authenticated using (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id())', t);
    execute format('drop policy if exists mgr_deliv on exhibitions.%I', t);
    execute format('create policy mgr_deliv on exhibitions.%I for all to authenticated using (exhibitions._im_can(''can_issue_wholesale'') and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions._im_can(''can_issue_wholesale'') and tenant_id=exhibitions.current_tenant_id())', t);
    execute format('grant select,insert,update,delete on exhibitions.%I to authenticated', t);
    execute format('grant all on exhibitions.%I to service_role', t);
  end loop;
end $$;
create index if not exists idx_route_stops_route on exhibitions.route_stops(route_id);
create index if not exists idx_deliveries_route on exhibitions.deliveries(route_id);

create or replace function exhibitions._deliv_tenant() returns uuid
language plpgsql stable security definer set search_path=exhibitions,public as $$
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_issue_wholesale')) then raise exception 'غير مصرّح'; end if;
  return exhibitions.current_tenant_id();
end $$;
revoke execute on function exhibitions._deliv_tenant() from public, anon, authenticated;

-- إنشاء/تعديل مسار
create or replace function exhibitions.route_set(p_id uuid, p_name text, p_rep_id uuid, p_active boolean default true)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._deliv_tenant(); v_id uuid;
begin
  if coalesce(trim(p_name),'')='' then raise exception 'اسم المسار مطلوب'; end if;
  if p_id is null then
    insert into exhibitions.delivery_routes(tenant_id,name,rep_id,is_active)
      values(v_t,p_name,p_rep_id,coalesce(p_active,true)) returning id into v_id;
  else
    update exhibitions.delivery_routes set name=p_name, rep_id=p_rep_id, is_active=coalesce(p_active,true)
      where id=p_id and tenant_id=v_t returning id into v_id;
    if v_id is null then raise exception 'المسار غير موجود'; end if;
  end if; return v_id;
end $$;

-- ضبط محطات المسار (عملاء بالترتيب). p_stops: [customer_id, ...] بالترتيب
create or replace function exhibitions.route_stops_set(p_route_id uuid, p_customer_ids jsonb)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._deliv_tenant(); r jsonb; v_seq int := 0; v_cid uuid;
begin
  if not exists(select 1 from exhibitions.delivery_routes where id=p_route_id and tenant_id=v_t) then
    raise exception 'المسار غير موجود'; end if;
  delete from exhibitions.route_stops where route_id=p_route_id and tenant_id=v_t;
  for r in select * from jsonb_array_elements(coalesce(p_customer_ids,'[]'::jsonb)) loop
    v_cid := (r#>>'{}')::uuid;
    if not exists(select 1 from exhibitions.customers where id=v_cid and tenant_id=v_t) then continue; end if;
    v_seq := v_seq + 1;
    insert into exhibitions.route_stops(tenant_id,route_id,customer_id,sequence)
      values(v_t,p_route_id,v_cid,v_seq)
      on conflict (route_id,customer_id) do update set sequence=excluded.sequence;
  end loop;
end $$;

create or replace function exhibitions.routes_list()
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._deliv_tenant();
begin
  return (select coalesce(json_agg(row_to_json(x) order by x.name),'[]') from (
    select dr.id, dr.name, dr.is_active, dr.rep_id,
      (select full_name from exhibitions.profiles p where p.id=dr.rep_id) as rep_name,
      (select count(*) from exhibitions.route_stops s where s.route_id=dr.id) as stops_count
    from exhibitions.delivery_routes dr where dr.tenant_id=v_t) x);
end $$;

create or replace function exhibitions.route_get(p_route_id uuid)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._deliv_tenant();
begin
  return (select json_build_object(
    'route',(select row_to_json(o) from (
      select dr.id, dr.name, dr.is_active, dr.rep_id,
        (select full_name from exhibitions.profiles p where p.id=dr.rep_id) as rep_name
      from exhibitions.delivery_routes dr where dr.id=p_route_id and dr.tenant_id=v_t) o),
    'stops',(select coalesce(json_agg(row_to_json(s) order by s.sequence),'[]') from (
      select st.id, st.customer_id, st.sequence, c.name as customer_name, c.phone,
        coalesce((select sum(case when e.kind='charge' then e.amount else -e.amount end)
                  from exhibitions.customer_entries e where e.customer_id=c.id),0) as balance
      from exhibitions.route_stops st
      join exhibitions.customers c on c.id=st.customer_id
      where st.route_id=p_route_id and st.tenant_id=v_t) s)
  ));
end $$;

-- تحميل الشاحنة: نقل من المستودع إلى عُهدة المندوب (مخزون الشاحنة)
create or replace function exhibitions.van_load(p_rep_id uuid, p_warehouse_id uuid, p_items jsonb)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._deliv_tenant(); v_actor uuid := exhibitions.current_profile_id();
        r jsonb; v_pid uuid; v_qty numeric;
begin
  if not exists(select 1 from exhibitions.warehouses where id=p_warehouse_id and tenant_id=v_t) then
    raise exception 'المستودع غير موجود'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_pid := (r->>'product_id')::uuid; v_qty := (r->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then continue; end if;
    perform exhibitions._move_stock(v_pid, v_qty, 'warehouse', p_warehouse_id,
      'employee_consignment', p_rep_id, 'consignment_out', 'van_load', null, v_actor);
    perform exhibitions._consume_fefo(v_pid, 'warehouse', p_warehouse_id, v_qty);
    perform exhibitions._batch_add(v_pid, 'employee_consignment', p_rep_id, v_qty, null, null);
  end loop;
end $$;

-- مخزون شاحنة مندوب
create or replace function exhibitions.rep_van_stock(p_rep_id uuid)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._deliv_tenant();
begin
  return (select coalesce(json_agg(row_to_json(x) order by x.name),'[]') from (
    select p.id as product_id, p.name, p.product_code, p.base_unit, i.quantity
    from exhibitions.inventory i
    join exhibitions.products p on p.id=i.product_id
    where i.location_type='employee_consignment' and i.location_id=p_rep_id
      and p.tenant_id=v_t and i.quantity > 0) x);
end $$;

-- تسجيل توصيل/بيع للعميل من الشاحنة
-- items: [{product_id, qty, unit_price, uom_id?}]
create or replace function exhibitions.record_delivery(
  p_route_id uuid, p_rep_id uuid, p_customer_id uuid, p_payment_method text, p_items jsonb, p_note text default null)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._deliv_tenant(); v_actor uuid := exhibitions.current_profile_id();
        v_del uuid; r jsonb; v_pid uuid; v_qty numeric; v_price numeric; v_uom uuid; v_factor numeric; v_uname text;
        v_base numeric; v_total numeric := 0; v_cogs numeric := 0; v_cost numeric; v_cash text;
        v_limit numeric; v_bal numeric; v_e uuid;
begin
  if p_payment_method not in ('cash','card','credit') then raise exception 'طريقة دفع غير صحيحة'; end if;
  if p_payment_method='credit' and p_customer_id is null then raise exception 'البيع بالدين يتطلب عميلًا'; end if;
  if p_rep_id is null then raise exception 'المندوب مطلوب'; end if;

  insert into exhibitions.deliveries(tenant_id,route_id,rep_id,customer_id,payment_method,total_sar,note,created_by)
    values(v_t,p_route_id,p_rep_id,p_customer_id,p_payment_method,0,p_note,v_actor) returning id into v_del;

  for r in select * from jsonb_array_elements(p_items) loop
    v_pid := (r->>'product_id')::uuid; v_qty := (r->>'qty')::numeric; v_price := (r->>'unit_price')::numeric;
    v_uom := nullif(r->>'uom_id','')::uuid;
    if not exists(select 1 from exhibitions.products where id=v_pid and tenant_id=v_t) then raise exception 'منتج غير صحيح'; end if;
    if v_qty is null or v_qty <= 0 then raise exception 'كمية غير صحيحة'; end if;
    if v_uom is not null then
      select factor, unit_name into v_factor, v_uname from exhibitions.product_uoms where id=v_uom and product_id=v_pid and tenant_id=v_t;
      if v_factor is null then raise exception 'وحدة قياس غير صحيحة'; end if;
    else
      v_factor := 1; select base_unit into v_uname from exhibitions.products where id=v_pid and tenant_id=v_t;
    end if;
    v_base := v_qty * v_factor;
    select cost_price_sar into v_cost from exhibitions.products where id=v_pid and tenant_id=v_t;
    insert into exhibitions.delivery_items(tenant_id,delivery_id,product_id,qty,unit_price_sar,uom_name,uom_factor,base_qty)
      values(v_t,v_del,v_pid,v_qty,v_price,v_uname,v_factor,v_base);
    -- خصم من مخزون الشاحنة (عُهدة المندوب) FEFO
    perform exhibitions._move_stock(v_pid, v_base, 'employee_consignment', p_rep_id, null,null, 'sale','deliveries',v_del,v_actor);
    perform exhibitions._consume_fefo(v_pid, 'employee_consignment', p_rep_id, v_base);
    v_total := v_total + (v_qty * v_price);
    v_cogs := v_cogs + (v_base * coalesce(v_cost,0));
  end loop;

  update exhibitions.deliveries set total_sar=v_total where id=v_del;

  -- الإيراد
  if p_payment_method = 'credit' then
    -- فرض حد الائتمان وتسجيل دين العميل + قيد 1300/4010
    select credit_limit into v_limit from exhibitions.customers where id=p_customer_id and tenant_id=v_t;
    if v_limit is null then raise exception 'العميل غير موجود'; end if;
    if v_limit > 0 then
      select coalesce(sum(case when kind='charge' then amount else -amount end),0) into v_bal
        from exhibitions.customer_entries where customer_id=p_customer_id and tenant_id=v_t;
      if v_bal + v_total > v_limit then
        raise exception 'تجاوز حد الائتمان: الرصيد % + % يتجاوز %', v_bal, v_total, v_limit;
      end if;
    end if;
    insert into exhibitions.customer_entries(tenant_id,customer_id,kind,amount,note,created_by)
      values(v_t,p_customer_id,'charge',v_total,coalesce(p_note,'توصيل آجل'),v_actor) returning id into v_e;
    perform exhibitions._post(current_date,'بيع توصيل آجل','deliveries',v_del,
      jsonb_build_array(jsonb_build_object('account','1300','debit',v_total,'credit',0),
                        jsonb_build_object('account','4010','debit',0,'credit',v_total)));
  else
    v_cash := case when p_payment_method='card' then '1020' else '1010' end;
    perform exhibitions._post(current_date,'بيع توصيل نقدي','deliveries',v_del,
      jsonb_build_array(jsonb_build_object('account',v_cash,'debit',v_total,'credit',0),
                        jsonb_build_object('account','4010','debit',0,'credit',v_total)));
  end if;

  -- تكلفة المبيعات
  if v_cogs > 0 then
    perform exhibitions._post(current_date,'تكلفة بضاعة توصيل','deliveries',v_del,
      jsonb_build_array(jsonb_build_object('account','5010','debit',v_cogs,'credit',0),
                        jsonb_build_object('account','1100','debit',0,'credit',v_cogs)));
  end if;

  return json_build_object('delivery_id', v_del, 'total', v_total, 'cogs', v_cogs);
end $$;

create or replace function exhibitions.deliveries_list(p_route_id uuid default null)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._deliv_tenant();
begin
  return (select coalesce(json_agg(row_to_json(x) order by x.created_at desc),'[]') from (
    select d.id, d.payment_method, d.total_sar, d.created_at, d.note,
      (select name from exhibitions.customers c where c.id=d.customer_id) as customer_name,
      (select full_name from exhibitions.profiles p where p.id=d.rep_id) as rep_name,
      (select name from exhibitions.delivery_routes dr where dr.id=d.route_id) as route_name
    from exhibitions.deliveries d
    where d.tenant_id=v_t and (p_route_id is null or d.route_id=p_route_id)) x);
end $$;

grant execute on function exhibitions.route_set(uuid, text, uuid, boolean) to authenticated;
grant execute on function exhibitions.route_stops_set(uuid, jsonb) to authenticated;
grant execute on function exhibitions.routes_list() to authenticated;
grant execute on function exhibitions.route_get(uuid) to authenticated;
grant execute on function exhibitions.van_load(uuid, uuid, jsonb) to authenticated;
grant execute on function exhibitions.rep_van_stock(uuid) to authenticated;
grant execute on function exhibitions.record_delivery(uuid, uuid, uuid, text, jsonb, text) to authenticated;
grant execute on function exhibitions.deliveries_list(uuid) to authenticated;
