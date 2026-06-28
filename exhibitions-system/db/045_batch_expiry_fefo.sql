-- ============================================================
-- تتبّع الدُفعات + تواريخ الصلاحية + FEFO | Migration 045
-- الفجوة #2 من بحث الأنظمة العالمية (NetSuite/Cin7/DEAR/Zoho).
-- حرج للأغذية: كل دفعة لها رقم وتاريخ صلاحية، ويُصرَف الأقرب انتهاءً أولًا
-- (First Expired First Out). اختياري لكل منتج عبر products.track_batches،
-- فالمنتجات غير المتتبَّعة تبقى تعمل كما هي تمامًا (المخزون الإجمالي مصدر الحقيقة).
--
-- التناسق: المخزون الإجمالي (inventory) يبقى مصدر الحقيقة للكمية الكلية،
-- وجدول stock_batches طبقة تتبّع فوقه. عند الاستلام تُنشأ/تُزاد دفعة،
-- وعند الصرف يُستهلك FEFO فقط إذا كان المنتج متتبَّعًا ومخزونه مغطّى بدفعات.
-- ============================================================

alter table exhibitions.products
  add column if not exists track_batches boolean not null default false;

create table if not exists exhibitions.stock_batches (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references exhibitions.tenants(id) on delete cascade,
  product_id    uuid not null references exhibitions.products(id) on delete cascade,
  batch_no      text,
  expiry_date   date,
  location_type exhibitions.location_type not null,
  location_id   uuid not null,
  qty           numeric(14,3) not null default 0,
  created_at    timestamptz not null default now()
);

do $$
declare t text; tbls text[] := array['stock_batches'];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_set_tenant on exhibitions.%I', t);
    execute format('create trigger trg_set_tenant before insert on exhibitions.%I for each row execute function exhibitions._set_tenant()', t);
    execute format('create index if not exists idx_%s_tenant on exhibitions.%I(tenant_id)', t, t);
    execute format('alter table exhibitions.%I enable row level security', t);
    execute format('drop policy if exists admin_all on exhibitions.%I', t);
    execute format('create policy admin_all on exhibitions.%I for all to authenticated using (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id())', t);
    execute format('drop policy if exists mgr_batch on exhibitions.%I', t);
    execute format('create policy mgr_batch on exhibitions.%I for all to authenticated using (exhibitions._im_can(''can_add_stock'') and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions._im_can(''can_add_stock'') and tenant_id=exhibitions.current_tenant_id())', t);
    execute format('grant select,insert,update,delete on exhibitions.%I to authenticated', t);
    execute format('grant all on exhibitions.%I to service_role', t);
  end loop;
end $$;
create index if not exists idx_stock_batches_lookup
  on exhibitions.stock_batches(product_id, location_type, location_id, expiry_date);

-- إضافة/زيادة دفعة في موقع (تجميع حسب رقم الدفعة + الصلاحية)
create or replace function exhibitions._batch_add(
  p_product_id uuid, p_loc_type exhibitions.location_type, p_loc_id uuid,
  p_qty numeric, p_batch_no text, p_expiry date)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions.current_tenant_id(); v_id uuid;
begin
  if p_qty <= 0 then return; end if;
  select id into v_id from exhibitions.stock_batches
    where product_id=p_product_id and location_type=p_loc_type and location_id=p_loc_id
      and coalesce(batch_no,'')=coalesce(p_batch_no,'')
      and coalesce(expiry_date,'4000-01-01')=coalesce(p_expiry,'4000-01-01')
      and tenant_id=v_t
    limit 1;
  if v_id is null then
    insert into exhibitions.stock_batches(tenant_id,product_id,batch_no,expiry_date,location_type,location_id,qty)
      values(v_t,p_product_id,p_batch_no,p_expiry,p_loc_type,p_loc_id,p_qty);
  else
    update exhibitions.stock_batches set qty=qty+p_qty where id=v_id;
  end if;
end $$;

-- استهلاك FEFO (الأقرب انتهاءً أولًا). يُستهلك فقط إذا كانت الدفعات تغطّي
-- الكمية المطلوبة بالكامل (منتج متتبَّع)؛ غير ذلك يتجاهل (يعمل بالمخزون الإجمالي).
create or replace function exhibitions._consume_fefo(
  p_product_id uuid, p_loc_type exhibitions.location_type, p_loc_id uuid, p_qty numeric)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions.current_tenant_id(); v_need numeric := p_qty; v_avail numeric; b record;
begin
  if p_qty <= 0 then return; end if;
  select coalesce(sum(qty),0) into v_avail from exhibitions.stock_batches
    where product_id=p_product_id and location_type=p_loc_type and location_id=p_loc_id and tenant_id=v_t;
  if v_avail < p_qty then return; end if; -- غير مغطّى بالدفعات: نترك المخزون الإجمالي يتكفّل
  for b in select * from exhibitions.stock_batches
      where product_id=p_product_id and location_type=p_loc_type and location_id=p_loc_id
        and tenant_id=v_t and qty>0
      order by expiry_date asc nulls last, created_at asc
      for update loop
    exit when v_need <= 0;
    if b.qty <= v_need then
      v_need := v_need - b.qty;
      delete from exhibitions.stock_batches where id=b.id;
    else
      update exhibitions.stock_batches set qty=qty-v_need where id=b.id;
      v_need := 0;
    end if;
  end loop;
end $$;

revoke execute on function exhibitions._batch_add(uuid, exhibitions.location_type, uuid, numeric, text, date) from public, anon, authenticated;
revoke execute on function exhibitions._consume_fefo(uuid, exhibitions.location_type, uuid, numeric) from public, anon, authenticated;

-- ============================================================
-- استلام مخزون مع دعم الدفعات (كل سطر قد يحمل batch_no و expiry)
-- ============================================================
create or replace function exhibitions.receive_stock(p_warehouse_id uuid, p_supplier_id uuid, p_items jsonb)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_receipt uuid; v_actor uuid; r jsonb; v_pid uuid; v_qty numeric; v_batch text; v_exp date; v_track boolean;
begin
  if not exhibitions._im_can('can_add_stock') then raise exception 'غير مصرّح بإضافة مخزون'; end if;
  v_actor := exhibitions.current_profile_id();
  insert into exhibitions.stock_receipts(warehouse_id,supplier_id,received_by)
    values(p_warehouse_id,p_supplier_id,v_actor) returning id into v_receipt;
  for r in select * from jsonb_array_elements(p_items) loop
    v_pid := (r->>'product_id')::uuid;
    v_qty := (r->>'qty')::numeric;
    v_batch := nullif(trim(r->>'batch_no'),'');
    v_exp := nullif(r->>'expiry','')::date;
    insert into exhibitions.stock_receipt_items(receipt_id,product_id,qty)
      values(v_receipt,v_pid,v_qty);
    perform exhibitions._move_stock(v_pid,v_qty,null,null,'warehouse',p_warehouse_id,'receipt','stock_receipts',v_receipt,v_actor);
    select track_batches into v_track from exhibitions.products where id=v_pid;
    if coalesce(v_track,false) or v_batch is not null or v_exp is not null then
      perform exhibitions._batch_add(v_pid,'warehouse',p_warehouse_id,v_qty,v_batch,v_exp);
    end if;
  end loop;
  return v_receipt;
end $$;

-- ============================================================
-- بيع الجملة: استهلاك FEFO بعد خصم المخزون الإجمالي
-- ============================================================
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
    perform exhibitions._consume_fefo(v_pid,'warehouse',p_warehouse_id,v_base);
    v_total := v_total + (v_qty*v_price);
  end loop;
  update exhibitions.wholesale_orders set total_sar=v_total where id=v_order;
  return json_build_object('order_id',v_order,'total',v_total);
end $function$;

-- ============================================================
-- تقارير الدفعات
-- ============================================================
create or replace function exhibitions._batch_tenant() returns uuid
language plpgsql stable security definer set search_path=exhibitions,public as $$
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_add_stock')) then raise exception 'غير مصرّح'; end if;
  return exhibitions.current_tenant_id();
end $$;
revoke execute on function exhibitions._batch_tenant() from public, anon, authenticated;

-- دفعات منتج معيّن (لكل المواقع)
create or replace function exhibitions.product_batches(p_product_id uuid)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._batch_tenant();
begin
  return (select coalesce(json_agg(row_to_json(x) order by x.expiry_date asc nulls last),'[]'::json) from (
    select b.id, b.batch_no, b.expiry_date, b.location_type, b.location_id, b.qty
    from exhibitions.stock_batches b
    where b.product_id=p_product_id and b.tenant_id=v_t and b.qty>0) x);
end $$;

-- الدفعات المنتهية/قريبة الانتهاء خلال p_days يومًا (منتهية = أيام سالبة)
create or replace function exhibitions.expiring_batches(p_days int default 30)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._batch_tenant();
begin
  return (select coalesce(json_agg(row_to_json(x) order by x.expiry_date asc),'[]'::json) from (
    select b.id, p.name as product_name, p.product_code, b.batch_no, b.expiry_date,
           b.location_type, b.location_id, b.qty,
           (b.expiry_date - current_date) as days_left
    from exhibitions.stock_batches b
    join exhibitions.products p on p.id=b.product_id
    where b.tenant_id=v_t and b.qty>0 and b.expiry_date is not null
      and b.expiry_date <= current_date + (p_days || ' days')::interval) x);
end $$;

grant execute on function exhibitions.product_batches(uuid) to authenticated;
grant execute on function exhibitions.expiring_batches(int) to authenticated;
