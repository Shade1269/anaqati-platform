-- ============================================================
-- وحدات القياس المتعددة (Multi-UoM) | Migration 044
-- الفجوة #1 من بحث الأنظمة العالمية: كرتون/علبة/كيلو مع تحويل تلقائي.
-- المبدأ: المخزون يُخزَّن دائمًا بالوحدة الأساس (base_unit) للمنتج،
-- وكل وحدة بديلة لها معامل تحويل factor = كم وحدة أساس في وحدة بديلة واحدة
-- (مثال: كرتون = 24 علبة → factor=24). عند البيع/الاستلام يختار المستخدم
-- الوحدة، فنحوّل الكمية إلى الوحدة الأساس لحركة المخزون، ونحفظ الوحدة
-- المعروضة وسعرها للوحدة على سطر الحركة.
--
-- يدعم الكسور (كيلو/لتر) عبر توسيع أعمدة الكمية إلى numeric(14,3).
-- الصلاحية: المالك أو مدير بصلاحية can_add_stock (إعداد مخزون).
-- ============================================================

-- 1) وحدة الأساس على المنتج
alter table exhibitions.products
  add column if not exists base_unit text not null default 'وحدة';

-- 2) جدول وحدات القياس البديلة لكل منتج
create table if not exists exhibitions.product_uoms (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references exhibitions.tenants(id) on delete cascade,
  product_id uuid not null references exhibitions.products(id) on delete cascade,
  unit_name  text not null,                                  -- اسم الوحدة (كرتون/علبة/كيلو)
  factor     numeric(14,4) not null check (factor > 0),      -- كم وحدة أساس في وحدة واحدة منها
  barcode    text,                                           -- باركود خاص بهذه الوحدة (اختياري)
  created_at timestamptz not null default now(),
  unique (product_id, unit_name)
);

do $$
declare t text; tbls text[] := array['product_uoms'];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_set_tenant on exhibitions.%I', t);
    execute format('create trigger trg_set_tenant before insert on exhibitions.%I for each row execute function exhibitions._set_tenant()', t);
    execute format('create index if not exists idx_%s_tenant on exhibitions.%I(tenant_id)', t, t);
    execute format('alter table exhibitions.%I enable row level security', t);
    execute format('drop policy if exists admin_all on exhibitions.%I', t);
    execute format('create policy admin_all on exhibitions.%I for all to authenticated using (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id())', t);
    execute format('drop policy if exists mgr_uom on exhibitions.%I', t);
    execute format('create policy mgr_uom on exhibitions.%I for all to authenticated using (exhibitions._im_can(''can_add_stock'') and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions._im_can(''can_add_stock'') and tenant_id=exhibitions.current_tenant_id())', t);
    execute format('grant select,insert,update,delete on exhibitions.%I to authenticated', t);
    execute format('grant all on exhibitions.%I to service_role', t);
  end loop;
end $$;
create index if not exists idx_product_uoms_product on exhibitions.product_uoms(product_id);

-- 3) توسيع أعمدة الكمية لدعم الكسور (كيلو/لتر) — متوافق رجعيًا مع الأعداد الصحيحة
alter table exhibitions.inventory            alter column quantity type numeric(14,3);
alter table exhibitions.stock_movements      alter column qty      type numeric(14,3);
alter table exhibitions.wholesale_order_items alter column qty     type numeric(14,3);
alter table exhibitions.stock_receipt_items  alter column qty      type numeric(14,3);

-- أعمدة عرض الوحدة على سطر بيع الجملة
alter table exhibitions.wholesale_order_items
  add column if not exists uom_name   text,
  add column if not exists uom_factor numeric(14,4) not null default 1,
  add column if not exists base_qty   numeric(14,3);

-- 4) محرك المخزون بدقة numeric (إسقاط النسخة القديمة integer لتفادي التحميل الزائد)
drop function if exists exhibitions._move_stock(uuid, integer, exhibitions.location_type, uuid, exhibitions.location_type, uuid, exhibitions.movement_type, text, uuid, uuid);
create or replace function exhibitions._move_stock(
  p_product_id uuid, p_qty numeric,
  p_from_type exhibitions.location_type, p_from_id uuid,
  p_to_type exhibitions.location_type, p_to_id uuid,
  p_movement exhibitions.movement_type,
  p_ref_table text, p_ref_id uuid, p_actor uuid)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_avail numeric;
begin
  if p_qty <= 0 then raise exception 'الكمية لازم تكون أكبر من صفر'; end if;

  if p_from_type is not null then
    select quantity into v_avail from exhibitions.inventory
      where product_id=p_product_id and location_type=p_from_type and location_id=p_from_id for update;
    v_avail := coalesce(v_avail,0);
    if p_movement <> 'adjustment' and v_avail < p_qty then
      raise exception 'الكمية غير كافية (متاح %، مطلوب %)', v_avail, p_qty;
    end if;
    insert into exhibitions.inventory(product_id,location_type,location_id,quantity)
      values(p_product_id,p_from_type,p_from_id,-p_qty)
      on conflict (product_id,location_type,location_id)
      do update set quantity = exhibitions.inventory.quantity - p_qty, updated_at=now();
  end if;

  if p_to_type is not null then
    insert into exhibitions.inventory(product_id,location_type,location_id,quantity)
      values(p_product_id,p_to_type,p_to_id,p_qty)
      on conflict (product_id,location_type,location_id)
      do update set quantity = exhibitions.inventory.quantity + p_qty, updated_at=now();
  end if;

  insert into exhibitions.stock_movements(product_id,movement_type,qty,
      from_location_type,from_location_id,to_location_type,to_location_id,ref_table,ref_id,created_by)
    values(p_product_id,p_movement,p_qty,p_from_type,p_from_id,p_to_type,p_to_id,p_ref_table,p_ref_id,p_actor);
end $$;

-- 5) إدارة وحدات القياس (المالك أو مدير can_add_stock)
create or replace function exhibitions._uom_tenant() returns uuid
language plpgsql stable security definer set search_path=exhibitions,public as $$
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_add_stock')) then raise exception 'غير مصرّح'; end if;
  return exhibitions.current_tenant_id();
end $$;
revoke execute on function exhibitions._uom_tenant() from public, anon, authenticated;

-- قائمة وحدات منتج (تشمل الوحدة الأساس كأول عنصر factor=1)
create or replace function exhibitions.product_uom_list(p_product_id uuid)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._uom_tenant(); v_base text;
begin
  select base_unit into v_base from exhibitions.products where id=p_product_id and tenant_id=v_t;
  if v_base is null then raise exception 'المنتج غير موجود'; end if;
  return (
    select json_build_object(
      'base_unit', v_base,
      'units', coalesce((
        select json_agg(row_to_json(u) order by u.factor)
        from (select id, unit_name, factor, barcode from exhibitions.product_uoms
              where product_id=p_product_id and tenant_id=v_t) u),'[]'::json)
    ));
end $$;

-- استبدال كامل لوحدات المنتج: يضبط الوحدة الأساس + قائمة الوحدات البديلة
-- p_units: [{unit_name, factor, barcode?}]
create or replace function exhibitions.product_uom_set(p_product_id uuid, p_base_unit text, p_units jsonb default '[]'::jsonb)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._uom_tenant(); r jsonb; v_name text; v_factor numeric;
begin
  if not exists(select 1 from exhibitions.products where id=p_product_id and tenant_id=v_t) then
    raise exception 'المنتج غير موجود'; end if;
  if coalesce(trim(p_base_unit),'')='' then raise exception 'الوحدة الأساس مطلوبة'; end if;
  update exhibitions.products set base_unit=p_base_unit where id=p_product_id and tenant_id=v_t;
  delete from exhibitions.product_uoms where product_id=p_product_id and tenant_id=v_t;
  for r in select * from jsonb_array_elements(coalesce(p_units,'[]'::jsonb)) loop
    v_name := nullif(trim(r->>'unit_name'),'');
    v_factor := (r->>'factor')::numeric;
    if v_name is null then raise exception 'اسم الوحدة مطلوب'; end if;
    if v_factor is null or v_factor <= 0 then raise exception 'معامل التحويل لازم يكون أكبر من صفر'; end if;
    if v_name = p_base_unit then continue; end if; -- الأساس ليست وحدة بديلة
    insert into exhibitions.product_uoms(tenant_id,product_id,unit_name,factor,barcode)
      values(v_t,p_product_id,v_name,v_factor,nullif(trim(r->>'barcode'),''));
  end loop;
  return exhibitions.product_uom_list(p_product_id);
end $$;

-- 6) بيع الجملة مع دعم وحدات القياس
--    كل سطر: {product_id, qty, unit_price, uom_id?}
--    إن وُجد uom_id: نتحقق أنه يخص المنتج/المستأجر، base_qty = qty*factor، نحرّك base_qty.
--    السعر unit_price للوحدة المختارة، والإجمالي = qty*unit_price.
create or replace function exhibitions.create_wholesale_order(p_customer_name text, p_customer_phone text, p_warehouse_id uuid, p_payment_method text, p_items jsonb)
returns json language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_order uuid; r jsonb; v_total numeric:=0; v_qty numeric; v_price numeric; v_pid uuid; v_t uuid;
        v_uom uuid; v_factor numeric; v_uname text; v_base numeric;
begin
  if not exhibitions._im_can('can_issue_wholesale') then raise exception 'غير مصرّح بالبيع جملة'; end if;
  v_t := exhibitions.current_tenant_id();
  if not exists(select 1 from exhibitions.warehouses where id=p_warehouse_id and tenant_id=v_t) then
    raise exception 'المستودع غير موجود'; end if;
  v_actor := exhibitions.current_profile_id();
  insert into exhibitions.wholesale_orders(customer_name,customer_phone,warehouse_id,payment_method,total_sar,issued_by)
    values(p_customer_name,p_customer_phone,p_warehouse_id,p_payment_method::exhibitions.payment_method,0,v_actor) returning id into v_order;
  for r in select * from jsonb_array_elements(p_items) loop
    v_pid:=(r->>'product_id')::uuid; v_qty:=(r->>'qty')::numeric; v_price:=(r->>'unit_price')::numeric;
    v_uom:=nullif(r->>'uom_id','')::uuid;
    if not exists(select 1 from exhibitions.products where id=v_pid and tenant_id=v_t) then
      raise exception 'منتج غير صحيح'; end if;
    if v_qty is null or v_qty <= 0 then raise exception 'كمية غير صحيحة'; end if;
    if v_uom is not null then
      select factor, unit_name into v_factor, v_uname from exhibitions.product_uoms
        where id=v_uom and product_id=v_pid and tenant_id=v_t;
      if v_factor is null then raise exception 'وحدة قياس غير صحيحة للمنتج'; end if;
    else
      v_factor := 1;
      select base_unit into v_uname from exhibitions.products where id=v_pid and tenant_id=v_t;
    end if;
    v_base := v_qty * v_factor;
    insert into exhibitions.wholesale_order_items(order_id,product_id,qty,unit_price_sar,uom_name,uom_factor,base_qty)
      values(v_order,v_pid,v_qty,v_price,v_uname,v_factor,v_base);
    perform exhibitions._move_stock(v_pid,v_base,'warehouse',p_warehouse_id,null,null,'wholesale','wholesale_orders',v_order,v_actor);
    v_total := v_total + (v_qty*v_price);
  end loop;
  update exhibitions.wholesale_orders set total_sar=v_total where id=v_order;
  return json_build_object('order_id',v_order,'total',v_total);
end $function$;

grant execute on function exhibitions.product_uom_list(uuid) to authenticated;
grant execute on function exhibitions.product_uom_set(uuid, text, jsonb) to authenticated;
