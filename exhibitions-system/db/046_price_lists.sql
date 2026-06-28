-- ============================================================
-- قوائم الأسعار + التسعير المتدرّج بالكمية | Migration 046
-- الفجوة #3 من بحث الأنظمة العالمية (Erply/Zoho/BlueCart/Daftra).
-- كل قائمة أسعار تضم بنودًا لكل منتج بسعر للوحدة الأساس وحدّ أدنى للكمية
-- (تدرّج بالكمية). يُربط العميل بقائمة، ويُحلّ السعر تلقائيًا حسب الكمية
-- والوحدة المختارة: سعر الوحدة = سعر الوحدة الأساس × معامل الوحدة.
-- يخدم بيع الجملة والسوق الداخلي B2B.
-- الصلاحية: المالك أو مدير بصلاحية can_manage_store.
-- ============================================================

create table if not exists exhibitions.price_lists (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references exhibitions.tenants(id) on delete cascade,
  name       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists exhibitions.price_list_items (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references exhibitions.tenants(id) on delete cascade,
  price_list_id uuid not null references exhibitions.price_lists(id) on delete cascade,
  product_id    uuid not null references exhibitions.products(id) on delete cascade,
  min_qty       numeric(14,3) not null default 1 check (min_qty > 0), -- بالوحدة الأساس
  unit_price    numeric(14,2) not null check (unit_price >= 0),        -- لكل وحدة أساس
  created_at    timestamptz not null default now(),
  unique (price_list_id, product_id, min_qty)
);

-- ربط العميل بقائمة أسعار
alter table exhibitions.customers
  add column if not exists price_list_id uuid references exhibitions.price_lists(id) on delete set null;

do $$
declare t text; tbls text[] := array['price_lists','price_list_items'];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_set_tenant on exhibitions.%I', t);
    execute format('create trigger trg_set_tenant before insert on exhibitions.%I for each row execute function exhibitions._set_tenant()', t);
    execute format('create index if not exists idx_%s_tenant on exhibitions.%I(tenant_id)', t, t);
    execute format('alter table exhibitions.%I enable row level security', t);
    execute format('drop policy if exists admin_all on exhibitions.%I', t);
    execute format('create policy admin_all on exhibitions.%I for all to authenticated using (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id())', t);
    execute format('drop policy if exists mgr_price on exhibitions.%I', t);
    execute format('create policy mgr_price on exhibitions.%I for all to authenticated using (exhibitions._im_can(''can_manage_store'') and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions._im_can(''can_manage_store'') and tenant_id=exhibitions.current_tenant_id())', t);
    execute format('grant select,insert,update,delete on exhibitions.%I to authenticated', t);
    execute format('grant all on exhibitions.%I to service_role', t);
  end loop;
end $$;
create index if not exists idx_price_list_items_lookup
  on exhibitions.price_list_items(price_list_id, product_id, min_qty);

-- ============================================================
-- صلاحية الإدارة
-- ============================================================
create or replace function exhibitions._price_tenant() returns uuid
language plpgsql stable security definer set search_path=exhibitions,public as $$
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_manage_store')) then raise exception 'غير مصرّح'; end if;
  return exhibitions.current_tenant_id();
end $$;
revoke execute on function exhibitions._price_tenant() from public, anon, authenticated;

-- قائمة كل قوائم الأسعار مع عدد البنود
create or replace function exhibitions.price_lists_list()
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._price_tenant();
begin
  return (select coalesce(json_agg(row_to_json(x) order by x.name),'[]'::json) from (
    select pl.id, pl.name, pl.is_active,
      (select count(*) from exhibitions.price_list_items i where i.price_list_id=pl.id) as items_count
    from exhibitions.price_lists pl where pl.tenant_id=v_t) x);
end $$;

-- بنود قائمة أسعار محددة
create or replace function exhibitions.price_list_items_list(p_price_list_id uuid)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._price_tenant();
begin
  return (select coalesce(json_agg(row_to_json(x) order by x.product_name, x.min_qty),'[]'::json) from (
    select i.id, i.product_id, p.name as product_name, p.product_code, p.base_unit,
           i.min_qty, i.unit_price
    from exhibitions.price_list_items i
    join exhibitions.products p on p.id=i.product_id
    where i.price_list_id=p_price_list_id and i.tenant_id=v_t) x);
end $$;

-- إنشاء/تعديل قائمة أسعار
create or replace function exhibitions.price_list_set(p_id uuid, p_name text, p_active boolean default true)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._price_tenant(); v_id uuid;
begin
  if coalesce(trim(p_name),'')='' then raise exception 'اسم القائمة مطلوب'; end if;
  if p_id is null then
    insert into exhibitions.price_lists(tenant_id,name,is_active) values(v_t,p_name,coalesce(p_active,true)) returning id into v_id;
  else
    update exhibitions.price_lists set name=p_name,is_active=coalesce(p_active,true)
      where id=p_id and tenant_id=v_t returning id into v_id;
    if v_id is null then raise exception 'القائمة غير موجودة'; end if;
  end if; return v_id;
end $$;

-- استبدال بنود قائمة أسعار بالكامل
-- p_items: [{product_id, min_qty, unit_price}]
create or replace function exhibitions.price_list_items_set(p_price_list_id uuid, p_items jsonb)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._price_tenant(); r jsonb; v_pid uuid; v_min numeric; v_price numeric;
begin
  if not exists(select 1 from exhibitions.price_lists where id=p_price_list_id and tenant_id=v_t) then
    raise exception 'القائمة غير موجودة'; end if;
  delete from exhibitions.price_list_items where price_list_id=p_price_list_id and tenant_id=v_t;
  for r in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_pid := (r->>'product_id')::uuid;
    v_min := coalesce((r->>'min_qty')::numeric, 1);
    v_price := (r->>'unit_price')::numeric;
    if v_pid is null then raise exception 'منتج مطلوب'; end if;
    if not exists(select 1 from exhibitions.products where id=v_pid and tenant_id=v_t) then
      raise exception 'منتج غير صحيح'; end if;
    if v_min is null or v_min <= 0 then v_min := 1; end if;
    if v_price is null or v_price < 0 then raise exception 'سعر غير صحيح'; end if;
    insert into exhibitions.price_list_items(tenant_id,price_list_id,product_id,min_qty,unit_price)
      values(v_t,p_price_list_id,v_pid,v_min,v_price)
      on conflict (price_list_id,product_id,min_qty)
      do update set unit_price=excluded.unit_price;
  end loop;
  return exhibitions.price_list_items_list(p_price_list_id);
end $$;

-- ============================================================
-- حلّ السعر: سعر الوحدة المختارة حسب الكمية وقائمة الأسعار
-- يُرجع سعرًا لكل وحدة مختارة (= سعر الوحدة الأساس × معامل الوحدة).
-- p_qty بالوحدة المختارة. يحوّلها للوحدة الأساس للمطابقة على الشرائح.
-- ============================================================
create or replace function exhibitions.resolve_price(
  p_product_id uuid, p_uom_id uuid default null, p_qty numeric default 1, p_price_list_id uuid default null)
returns numeric language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid; v_factor numeric := 1; v_base_qty numeric; v_base_price numeric;
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_manage_store') or exhibitions._im_can('can_issue_wholesale')) then
    raise exception 'غير مصرّح';
  end if;
  v_t := exhibitions.current_tenant_id();
  if not exists(select 1 from exhibitions.products where id=p_product_id and tenant_id=v_t) then
    raise exception 'منتج غير صحيح'; end if;
  if p_uom_id is not null then
    select factor into v_factor from exhibitions.product_uoms where id=p_uom_id and product_id=p_product_id and tenant_id=v_t;
    if v_factor is null then v_factor := 1; end if;
  end if;
  v_base_qty := coalesce(p_qty,1) * v_factor;

  if p_price_list_id is not null then
    select unit_price into v_base_price from exhibitions.price_list_items
      where price_list_id=p_price_list_id and product_id=p_product_id and tenant_id=v_t
        and min_qty <= v_base_qty
      order by min_qty desc limit 1;
  end if;

  if v_base_price is null then
    select sale_price_ref into v_base_price from exhibitions.products where id=p_product_id and tenant_id=v_t;
  end if;

  return round(coalesce(v_base_price,0) * v_factor, 2);
end $$;

grant execute on function exhibitions.price_lists_list() to authenticated;
grant execute on function exhibitions.price_list_items_list(uuid) to authenticated;
grant execute on function exhibitions.price_list_set(uuid, text, boolean) to authenticated;
grant execute on function exhibitions.price_list_items_set(uuid, jsonb) to authenticated;
grant execute on function exhibitions.resolve_price(uuid, uuid, numeric, uuid) to authenticated;
