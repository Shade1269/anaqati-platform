-- ============================================================
-- بيانات تجريبية جاهزة لعرض «التوزيع» | seed_demo_distribution.sql
-- يُشغَّل في Supabase SQL Editor (يعمل كـ service_role فيتجاوز RLS).
-- يملأ: مورّد + مستودع + 3 منتجات (بوحدات قياس ودفعات ونقطة إعادة طلب)
--       + مخزون افتتاحي + قائمة أسعار متدرّجة + عميلان بحد ائتمان.
-- آمن لإعادة التشغيل: يحذف بيانات الديمو القديمة (بادئة DEMO-) أولًا.
--
-- خطوة وحيدة قبل التشغيل: ضع معرّف مستأجر التوزيع في v_tenant بالأسفل.
--   (احصل عليه: select id,name,business_type from exhibitions.tenants
--    where business_type='distribution';)
-- ============================================================

do $$
declare
  v_tenant uuid := '00000000-0000-0000-0000-000000000000'; -- ⬅️ ضع معرّف المستأجر هنا
  v_wh   uuid;
  v_sup  uuid;
  p_rice uuid; p_oil uuid; p_sugar uuid;
  v_list uuid;
  c_baqala uuid; c_matam uuid;
begin
  if not exists (select 1 from exhibitions.tenants where id=v_tenant) then
    raise exception 'ضع معرّف مستأجر صحيح في v_tenant أولًا';
  end if;
  -- يجعل مشغّلات _set_tenant تُسند المستأجر الصحيح تلقائيًا
  perform set_config('exhibitions.current_tenant', v_tenant::text, true);

  -- تنظيف بيانات ديمو سابقة
  delete from exhibitions.products  where tenant_id=v_tenant and product_code like 'DEMO-%';
  delete from exhibitions.suppliers where tenant_id=v_tenant and name like 'DEMO %';
  delete from exhibitions.warehouses where tenant_id=v_tenant and name like 'DEMO %';
  delete from exhibitions.customers where tenant_id=v_tenant and name like 'DEMO %';
  delete from exhibitions.price_lists where tenant_id=v_tenant and name like 'DEMO %';

  -- مستودع ومورّد
  insert into exhibitions.warehouses(tenant_id,name,location,is_active)
    values(v_tenant,'DEMO المستودع الرئيسي','دمشق',true) returning id into v_wh;
  insert into exhibitions.suppliers(tenant_id,name,phone,is_active)
    values(v_tenant,'DEMO مورّد المواد الغذائية','0911000000',true) returning id into v_sup;

  -- منتجات: أرز (كيس/كرتون)، زيت (عبوة/كرتون، يتتبّع صلاحية)، سكر (كيلو)
  insert into exhibitions.products(tenant_id,product_code,name,sale_price_ref,cost_price_sar,supplier_id,base_unit,track_batches,reorder_level,is_active)
    values(v_tenant,'DEMO-RICE','أرز بسمتي',12,8,v_sup,'كيس',false,40,true) returning id into p_rice;
  insert into exhibitions.products(tenant_id,product_code,name,sale_price_ref,cost_price_sar,supplier_id,base_unit,track_batches,reorder_level,is_active)
    values(v_tenant,'DEMO-OIL','زيت دوّار الشمس',25,18,v_sup,'عبوة',true,30,true) returning id into p_oil;
  insert into exhibitions.products(tenant_id,product_code,name,sale_price_ref,cost_price_sar,supplier_id,base_unit,track_batches,reorder_level,is_active)
    values(v_tenant,'DEMO-SUGAR','سكر',6,4,v_sup,'كيلو',false,100,false) returning id into p_sugar;

  -- وحدات قياس بديلة: كرتون أرز=10 أكياس، كرتون زيت=12 عبوة
  insert into exhibitions.product_uoms(tenant_id,product_id,unit_name,factor)
    values(v_tenant,p_rice,'كرتون',10),(v_tenant,p_oil,'كرتون',12);

  -- مخزون افتتاحي + دفعات للزيت (صلاحية قريبة لإظهار التنبيه)
  insert into exhibitions.inventory(tenant_id,product_id,location_type,location_id,quantity) values
    (v_tenant,p_rice,'warehouse',v_wh,200),
    (v_tenant,p_oil,'warehouse',v_wh,120),
    (v_tenant,p_sugar,'warehouse',v_wh,60);   -- أقل من نقطة إعادة الطلب (100) ⇒ سيظهر في تقرير النقص
  insert into exhibitions.stock_batches(tenant_id,product_id,batch_no,expiry_date,location_type,location_id,qty) values
    (v_tenant,p_oil,'OIL-A',(current_date + 20),'warehouse',v_wh,40),   -- قريبة الانتهاء ⇒ تنبيه + تُصرَف أولًا
    (v_tenant,p_oil,'OIL-B',(current_date + 200),'warehouse',v_wh,80);

  -- قائمة أسعار متدرّجة (سعر الوحدة الأساس) مرتبطة بعميل الجملة
  insert into exhibitions.price_lists(tenant_id,name,is_active)
    values(v_tenant,'DEMO أسعار الجملة',true) returning id into v_list;
  insert into exhibitions.price_list_items(tenant_id,price_list_id,product_id,min_qty,unit_price) values
    (v_tenant,v_list,p_rice,1,12),(v_tenant,v_list,p_rice,50,11),(v_tenant,v_list,p_rice,100,10),
    (v_tenant,v_list,p_oil,1,25),(v_tenant,v_list,p_oil,60,23);

  -- عملاء بحد ائتمان
  insert into exhibitions.customers(tenant_id,name,phone,credit_limit,price_list_id,is_active)
    values(v_tenant,'DEMO بقالة الحي','0944111111',5000,v_list,true) returning id into c_baqala;
  insert into exhibitions.customers(tenant_id,name,phone,credit_limit,is_active)
    values(v_tenant,'DEMO مطعم الشام','0944222222',3000,true) returning id into c_matam;

  raise notice 'تم تجهيز بيانات الديمو ✓  المستودع=%  قائمة الأسعار=%', v_wh, v_list;
end $$;
