-- ============================================================
-- استيراد البيانات الجماعي (ترحيل من البيان/الأمين) | Migration 053
-- التجار لديهم مخزون قائم في برامج سطح المكتب (البيان/الأمين) التي تُصدّر
-- بطاقات المواد والأرصدة إلى Excel/CSV. هذه الدالة تستقبل تلك الصفوف وتُنشئ:
--   • المنتج (upsert حسب كود المنتج داخل المستأجر)
--   • الرصيد الافتتاحي للمخزون في مستودع (ضبط الكمية للقيمة المعطاة — idempotent)
--   • الصلاحية كدفعة افتتاحية (اختياري)
--   • المورّد (اختياري، يُنشأ إن لم يوجد)
-- آمنة لإعادة التشغيل: الكمية تُضبط للقيمة المطلوبة لا تُضاف.
-- الصلاحية: المالك أو مدير بصلاحية can_add_stock.
--
-- كل صف: {code, name, base_unit?, cost?, price?, qty?, reorder?, expiry?, batch_no?, supplier?}
-- ============================================================

create or replace function exhibitions.import_products(p_warehouse_id uuid, p_rows jsonb)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare
  v_t uuid; v_actor uuid; r jsonb;
  v_code text; v_name text; v_unit text; v_cost numeric; v_price numeric; v_qty numeric;
  v_reorder numeric; v_expiry date; v_batch text; v_sup_name text; v_sup uuid;
  v_pid uuid; v_inserted boolean; v_track boolean; v_cur numeric; v_diff numeric;
  v_created int := 0; v_updated int := 0; v_stock int := 0; v_idx int := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_add_stock')) then raise exception 'غير مصرّح'; end if;
  v_t := exhibitions.current_tenant_id();
  v_actor := exhibitions.current_profile_id();
  if not exists(select 1 from exhibitions.warehouses where id=p_warehouse_id and tenant_id=v_t) then
    raise exception 'المستودع غير موجود'; end if;

  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    v_idx := v_idx + 1;
    begin
      v_code := nullif(trim(r->>'code'),'');
      v_name := nullif(trim(r->>'name'),'');
      if v_code is null or v_name is null then
        v_errors := v_errors || jsonb_build_object('row', v_idx, 'message', 'الكود والاسم مطلوبان');
        continue;
      end if;
      v_unit    := coalesce(nullif(trim(r->>'base_unit'),''),'وحدة');
      v_cost    := nullif(r->>'cost','')::numeric;
      v_price   := nullif(r->>'price','')::numeric;
      v_qty     := nullif(r->>'qty','')::numeric;
      v_reorder := coalesce(nullif(r->>'reorder','')::numeric, 0);
      v_expiry  := nullif(r->>'expiry','')::date;
      v_batch   := nullif(trim(r->>'batch_no'),'');
      v_sup_name:= nullif(trim(r->>'supplier'),'');
      v_track   := (v_expiry is not null);

      -- المورّد (اختياري)
      v_sup := null;
      if v_sup_name is not null then
        select id into v_sup from exhibitions.suppliers where tenant_id=v_t and name=v_sup_name limit 1;
        if v_sup is null then
          insert into exhibitions.suppliers(tenant_id,name,is_active) values(v_t,v_sup_name,true) returning id into v_sup;
        end if;
      end if;

      -- upsert المنتج حسب (المستأجر, الكود)
      insert into exhibitions.products(tenant_id,product_code,name,base_unit,cost_price_sar,sale_price_ref,reorder_level,supplier_id,track_batches,is_active)
        values(v_t,v_code,v_name,v_unit,coalesce(v_cost,0),coalesce(v_price,0),v_reorder,v_sup,v_track,true)
      on conflict (tenant_id,product_code) do update set
        name=excluded.name, base_unit=excluded.base_unit,
        cost_price_sar=coalesce(excluded.cost_price_sar, exhibitions.products.cost_price_sar),
        sale_price_ref=coalesce(excluded.sale_price_ref, exhibitions.products.sale_price_ref),
        reorder_level=excluded.reorder_level,
        supplier_id=coalesce(excluded.supplier_id, exhibitions.products.supplier_id),
        track_batches=(exhibitions.products.track_batches or excluded.track_batches)
      returning id, (xmax=0) into v_pid, v_inserted;

      if v_inserted then v_created := v_created + 1; else v_updated := v_updated + 1; end if;

      -- الرصيد الافتتاحي: ضبط كمية المستودع للقيمة المطلوبة (idempotent)
      if v_qty is not null then
        select coalesce(quantity,0) into v_cur from exhibitions.inventory
          where product_id=v_pid and location_type='warehouse' and location_id=p_warehouse_id;
        v_cur := coalesce(v_cur,0);
        v_diff := v_qty - v_cur;
        if v_diff > 0 then
          perform exhibitions._move_stock(v_pid, v_diff, null,null, 'warehouse', p_warehouse_id, 'adjustment','products_import',null,v_actor);
        elsif v_diff < 0 then
          perform exhibitions._move_stock(v_pid, -v_diff, 'warehouse', p_warehouse_id, null,null, 'adjustment','products_import',null,v_actor);
        end if;
        v_stock := v_stock + 1;

        -- صلاحية: دفعة افتتاحية واحدة (تستبدل دفعات هذا الصنف في المستودع)
        if v_expiry is not null then
          delete from exhibitions.stock_batches
            where product_id=v_pid and location_type='warehouse' and location_id=p_warehouse_id and tenant_id=v_t;
          perform exhibitions._batch_add(v_pid,'warehouse',p_warehouse_id, v_qty, coalesce(v_batch,'افتتاحي'), v_expiry);
        end if;
      end if;
    exception when others then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'code', coalesce(v_code,''), 'message', SQLERRM);
    end;
  end loop;

  return json_build_object('created',v_created,'updated',v_updated,'stock_set',v_stock,'errors',v_errors);
end $$;

grant execute on function exhibitions.import_products(uuid, jsonb) to authenticated;
