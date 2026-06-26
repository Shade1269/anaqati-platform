-- ============================================================
-- الولاء/النقاط للمطاعم والكافيهات | Migration 040
-- earn_rate نقطة لكل وحدة عملة، redeem_value قيمة كل نقطة عند الاستبدال.
-- العميل يُربط بالهاتف عند الدفع؛ الاستبدال خصم لا يتجاوز الإيراد.
-- close_table_bill أُعيد إنشاؤها بتوقيع موسّع (customer_id + redeem_points).
-- (التعريفات الكاملة طُبّقت على القاعدة؛ هذا الملف للمزامنة.)
-- ============================================================
alter table exhibitions.tenants
  add column if not exists loyalty_enabled boolean not null default false,
  add column if not exists loyalty_earn_rate numeric(8,4) not null default 0,
  add column if not exists loyalty_redeem_value numeric(10,4) not null default 0;
alter table exhibitions.customers add column if not exists points integer not null default 0;

create or replace function exhibitions.set_loyalty_settings(p_enabled boolean, p_earn_rate numeric, p_redeem_value numeric)
returns void language plpgsql security definer set search_path to 'exhibitions','public' as $function$
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_manage_restaurant')) then raise exception 'غير مصرّح'; end if;
  update exhibitions.tenants set loyalty_enabled=coalesce(p_enabled,false),
    loyalty_earn_rate=greatest(coalesce(p_earn_rate,0),0), loyalty_redeem_value=greatest(coalesce(p_redeem_value,0),0)
  where id=exhibitions.current_tenant_id();
end $function$;

create or replace function exhibitions.loyalty_customer(p_phone text, p_name text default null, p_token uuid default null)
returns json language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_tenant uuid; v_id uuid; v_name text; v_points int; v_rv numeric; v_en boolean;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if p_token is not null then perform exhibitions._emp_require(v_actor,'can_waiter'); end if;
  if coalesce(trim(p_phone),'')='' then raise exception 'أدخل رقم الهاتف'; end if;
  select id, name, points into v_id, v_name, v_points from exhibitions.customers where tenant_id=v_tenant and phone=trim(p_phone) limit 1;
  if v_id is null then
    insert into exhibitions.customers(tenant_id,name,phone,points)
      values(v_tenant, coalesce(nullif(trim(p_name),''),'زبون '||trim(p_phone)), trim(p_phone), 0)
      returning id, name, points into v_id, v_name, v_points;
  end if;
  select coalesce(loyalty_redeem_value,0), coalesce(loyalty_enabled,false) into v_rv, v_en from exhibitions.tenants where id=v_tenant;
  return json_build_object('id',v_id,'name',v_name,'points',v_points,'redeem_value',v_rv,'enabled',v_en);
end $function$;

grant execute on function exhibitions.set_loyalty_settings(boolean,numeric,numeric) to authenticated;
grant execute on function exhibitions.loyalty_customer(text,text,uuid) to authenticated;

-- restaurant_settings + close_table_bill (بالولاء) — انظر القاعدة الحيّة للتعريف الكامل المطبّق.
