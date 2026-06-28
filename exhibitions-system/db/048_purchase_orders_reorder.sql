-- ============================================================
-- أوامر الشراء (PO) + الاستلام (GRN) + نقطة إعادة الطلب | Migration 048
-- الفجوة #5 من بحث الأنظمة العالمية (Odoo/SAP B1/Zoho/BlueCart).
-- يبني فوق stock_receipts الحالي: الاستلام مقابل أمر شراء يُنشئ سند استلام
-- عاديًا (كي يلتقطه رصيد المورد المحسوب من المشتريات)، ويحرّك المخزون
-- ويسجّل الدفعات (FEFO) — دون قيود GL إضافية (متّسق مع receive_stock).
-- الصلاحية: المالك أو مدير بصلاحية can_add_stock.
-- ============================================================

-- نقطة إعادة الطلب على المنتج (0 = بلا تتبّع)
alter table exhibitions.products
  add column if not exists reorder_level numeric(14,3) not null default 0;

create table if not exists exhibitions.purchase_orders (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references exhibitions.tenants(id) on delete cascade,
  supplier_id  uuid references exhibitions.suppliers(id) on delete set null,
  warehouse_id uuid not null references exhibitions.warehouses(id) on delete restrict,
  status       text not null default 'sent' check (status in ('draft','sent','partial','received','cancelled')),
  notes        text,
  total_sar    numeric(14,2) not null default 0,
  created_by   uuid references exhibitions.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists exhibitions.purchase_order_items (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references exhibitions.tenants(id) on delete cascade,
  order_id       uuid not null references exhibitions.purchase_orders(id) on delete cascade,
  product_id     uuid not null references exhibitions.products(id) on delete restrict,
  qty_ordered    numeric(14,3) not null check (qty_ordered > 0), -- بالوحدة المختارة
  qty_received   numeric(14,3) not null default 0,               -- بالوحدة المختارة
  unit_cost      numeric(14,2) not null default 0,               -- لكل وحدة مختارة
  uom_id         uuid references exhibitions.product_uoms(id) on delete set null,
  uom_name       text,
  uom_factor     numeric(14,4) not null default 1
);

do $$
declare t text; tbls text[] := array['purchase_orders','purchase_order_items'];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_set_tenant on exhibitions.%I', t);
    execute format('create trigger trg_set_tenant before insert on exhibitions.%I for each row execute function exhibitions._set_tenant()', t);
    execute format('create index if not exists idx_%s_tenant on exhibitions.%I(tenant_id)', t, t);
    execute format('alter table exhibitions.%I enable row level security', t);
    execute format('drop policy if exists admin_all on exhibitions.%I', t);
    execute format('create policy admin_all on exhibitions.%I for all to authenticated using (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id())', t);
    execute format('drop policy if exists mgr_po on exhibitions.%I', t);
    execute format('create policy mgr_po on exhibitions.%I for all to authenticated using (exhibitions._im_can(''can_add_stock'') and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions._im_can(''can_add_stock'') and tenant_id=exhibitions.current_tenant_id())', t);
    execute format('grant select,insert,update,delete on exhibitions.%I to authenticated', t);
    execute format('grant all on exhibitions.%I to service_role', t);
  end loop;
end $$;
create index if not exists idx_po_items_order on exhibitions.purchase_order_items(order_id);

create or replace function exhibitions._po_tenant() returns uuid
language plpgsql stable security definer set search_path=exhibitions,public as $$
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_add_stock')) then raise exception 'غير مصرّح'; end if;
  return exhibitions.current_tenant_id();
end $$;
revoke execute on function exhibitions._po_tenant() from public, anon, authenticated;

-- إنشاء أمر شراء. items: [{product_id, qty, unit_cost, uom_id?}]
create or replace function exhibitions.po_create(p_supplier_id uuid, p_warehouse_id uuid, p_notes text, p_items jsonb)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._po_tenant(); v_actor uuid := exhibitions.current_profile_id();
        v_po uuid; r jsonb; v_pid uuid; v_qty numeric; v_cost numeric; v_uom uuid; v_factor numeric; v_uname text; v_total numeric := 0;
begin
  if not exists(select 1 from exhibitions.warehouses where id=p_warehouse_id and tenant_id=v_t) then
    raise exception 'المستودع غير موجود'; end if;
  if p_supplier_id is not null and not exists(select 1 from exhibitions.suppliers where id=p_supplier_id) then
    raise exception 'المورد غير موجود'; end if;
  insert into exhibitions.purchase_orders(tenant_id,supplier_id,warehouse_id,status,notes,total_sar,created_by)
    values(v_t,p_supplier_id,p_warehouse_id,'sent',p_notes,0,v_actor) returning id into v_po;
  for r in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_pid := (r->>'product_id')::uuid;
    v_qty := (r->>'qty')::numeric;
    v_cost := coalesce((r->>'unit_cost')::numeric, 0);
    v_uom := nullif(r->>'uom_id','')::uuid;
    if not exists(select 1 from exhibitions.products where id=v_pid and tenant_id=v_t) then raise exception 'منتج غير صحيح'; end if;
    if v_qty is null or v_qty <= 0 then raise exception 'كمية غير صحيحة'; end if;
    if v_uom is not null then
      select factor, unit_name into v_factor, v_uname from exhibitions.product_uoms where id=v_uom and product_id=v_pid and tenant_id=v_t;
      if v_factor is null then raise exception 'وحدة قياس غير صحيحة'; end if;
    else
      v_factor := 1; select base_unit into v_uname from exhibitions.products where id=v_pid and tenant_id=v_t;
    end if;
    insert into exhibitions.purchase_order_items(tenant_id,order_id,product_id,qty_ordered,unit_cost,uom_id,uom_name,uom_factor)
      values(v_t,v_po,v_pid,v_qty,v_cost,v_uom,v_uname,v_factor);
    v_total := v_total + (v_qty * v_cost);
  end loop;
  update exhibitions.purchase_orders set total_sar=v_total where id=v_po;
  return json_build_object('order_id', v_po, 'total', v_total);
end $$;

-- استلام مقابل أمر شراء (GRN). items: [{po_item_id, qty, batch_no?, expiry?}]
create or replace function exhibitions.po_receive(p_po_id uuid, p_items jsonb)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._po_tenant(); v_actor uuid := exhibitions.current_profile_id();
        v_wh uuid; v_sup uuid; v_receipt uuid; r jsonb; v_iid uuid; v_qty numeric; v_batch text; v_exp date;
        it record; v_base numeric; v_track boolean; v_open int;
begin
  select warehouse_id, supplier_id into v_wh, v_sup from exhibitions.purchase_orders
    where id=p_po_id and tenant_id=v_t and status<>'cancelled';
  if v_wh is null then raise exception 'أمر الشراء غير موجود أو ملغى'; end if;

  insert into exhibitions.stock_receipts(warehouse_id,supplier_id,received_by)
    values(v_wh,v_sup,v_actor) returning id into v_receipt;

  for r in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_iid := (r->>'po_item_id')::uuid;
    v_qty := (r->>'qty')::numeric;
    v_batch := nullif(trim(r->>'batch_no'),'');
    v_exp := nullif(r->>'expiry','')::date;
    if v_qty is null or v_qty <= 0 then continue; end if;
    select * into it from exhibitions.purchase_order_items where id=v_iid and order_id=p_po_id and tenant_id=v_t;
    if it.id is null then raise exception 'بند غير صحيح'; end if;
    v_base := v_qty * it.uom_factor;
    insert into exhibitions.stock_receipt_items(receipt_id,product_id,qty) values(v_receipt,it.product_id,v_base);
    perform exhibitions._move_stock(it.product_id,v_base,null,null,'warehouse',v_wh,'receipt','stock_receipts',v_receipt,v_actor);
    select track_batches into v_track from exhibitions.products where id=it.product_id;
    if coalesce(v_track,false) or v_batch is not null or v_exp is not null then
      perform exhibitions._batch_add(it.product_id,'warehouse',v_wh,v_base,v_batch,v_exp);
    end if;
    update exhibitions.purchase_order_items set qty_received = qty_received + v_qty where id=v_iid;
  end loop;

  -- تحديث حالة أمر الشراء
  select count(*) into v_open from exhibitions.purchase_order_items
    where order_id=p_po_id and tenant_id=v_t and qty_received < qty_ordered;
  if v_open = 0 then
    update exhibitions.purchase_orders set status='received' where id=p_po_id;
  else
    update exhibitions.purchase_orders set status='partial'
      where id=p_po_id and exists(select 1 from exhibitions.purchase_order_items where order_id=p_po_id and qty_received > 0);
  end if;
  return v_receipt;
end $$;

create or replace function exhibitions.po_cancel(p_po_id uuid)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._po_tenant();
begin
  update exhibitions.purchase_orders set status='cancelled'
    where id=p_po_id and tenant_id=v_t and status in ('draft','sent','partial');
  if not found then raise exception 'تعذّر الإلغاء (غير موجود أو مكتمل)'; end if;
end $$;

create or replace function exhibitions.po_list()
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._po_tenant();
begin
  return (select coalesce(json_agg(row_to_json(x) order by x.created_at desc),'[]') from (
    select po.id, po.status, po.total_sar, po.notes, po.created_at,
           s.name as supplier_name, w.name as warehouse_name,
           (select count(*) from exhibitions.purchase_order_items i where i.order_id=po.id) as items_count
    from exhibitions.purchase_orders po
    left join exhibitions.suppliers s on s.id=po.supplier_id
    left join exhibitions.warehouses w on w.id=po.warehouse_id
    where po.tenant_id=v_t) x);
end $$;

create or replace function exhibitions.po_get(p_po_id uuid)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._po_tenant();
begin
  return (select json_build_object(
    'order',(select row_to_json(o) from (
        select po.id, po.status, po.total_sar, po.notes, po.created_at, po.warehouse_id,
               s.name as supplier_name, w.name as warehouse_name
        from exhibitions.purchase_orders po
        left join exhibitions.suppliers s on s.id=po.supplier_id
        left join exhibitions.warehouses w on w.id=po.warehouse_id
        where po.id=p_po_id and po.tenant_id=v_t) o),
    'items',(select coalesce(json_agg(row_to_json(it) order by it.product_name),'[]') from (
        select i.id, i.product_id, p.name as product_name, p.product_code,
               i.qty_ordered, i.qty_received, i.unit_cost, i.uom_name, i.uom_factor
        from exhibitions.purchase_order_items i
        join exhibitions.products p on p.id=i.product_id
        where i.order_id=p_po_id and i.tenant_id=v_t) it)
  ));
end $$;

-- تقرير المنتجات تحت نقطة إعادة الطلب (إجمالي المخزون عبر كل المواقع)
create or replace function exhibitions.low_stock_report()
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._po_tenant();
begin
  return (select coalesce(json_agg(row_to_json(x) order by (x.reorder_level - x.on_hand) desc),'[]') from (
    select p.id, p.name, p.product_code, p.base_unit, p.reorder_level,
           coalesce((select sum(i.quantity) from exhibitions.inventory i where i.product_id=p.id),0) as on_hand
    from exhibitions.products p
    where p.tenant_id=v_t and p.is_active and p.reorder_level > 0
      and coalesce((select sum(i.quantity) from exhibitions.inventory i where i.product_id=p.id),0) <= p.reorder_level) x);
end $$;

grant execute on function exhibitions.po_create(uuid, uuid, text, jsonb) to authenticated;
grant execute on function exhibitions.po_receive(uuid, jsonb) to authenticated;
grant execute on function exhibitions.po_cancel(uuid) to authenticated;
grant execute on function exhibitions.po_list() to authenticated;
grant execute on function exhibitions.po_get(uuid) to authenticated;
grant execute on function exhibitions.low_stock_report() to authenticated;
