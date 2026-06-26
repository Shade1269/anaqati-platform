-- ============================================================
-- الطلب أونلاين للمطعم (سفري/توصيل عن بُعد، مبني على المنيو) | Migration 035
-- صفحة عامة: الزبون يرى المنيو ويطلب سفري أو توصيل؛ الطلب يُنشئ جلسة بلا
-- طاولة (سفري/توصيل) ويصل للمطبخ ويديره الكاشير. مستقل عن متجر التجزئة.
-- ============================================================

create or replace function exhibitions.restaurant_public_info(p_tenant uuid)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
declare t record;
begin
  select brand_name,name,logo_url,primary_color,business_type,status,currency,secondary_currency,fx_rate,
         coalesce(delivery_fee,0) as delivery_fee, store_whatsapp
    into t from exhibitions.tenants where id=p_tenant;
  if not found or t.status<>'active' or coalesce(t.business_type,'retail')<>'restaurant' then
    raise exception 'غير متاح'; end if;
  return json_build_object('brand_name',coalesce(t.brand_name,t.name),'logo_url',t.logo_url,
    'primary_color',t.primary_color,'currency',coalesce(t.currency,'SAR'),
    'secondary_currency',t.secondary_currency,'fx_rate',t.fx_rate,
    'delivery_fee',t.delivery_fee,'whatsapp',t.store_whatsapp);
end $function$;

create or replace function exhibitions.restaurant_online_order(
  p_tenant uuid, p_order_type text, p_name text, p_phone text, p_address text,
  p_items jsonb, p_note text default null)
returns json language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_sess uuid; v_no text; v_order uuid; v_ono text; r jsonb; v_item exhibitions.menu_items;
        v_opts jsonb; v_opt jsonb; v_delta numeric; v_qty int; v_line numeric; v_total numeric:=0; v_fee numeric;
begin
  if not exists(select 1 from exhibitions.tenants where id=p_tenant and status='active' and business_type='restaurant') then
    raise exception 'غير متاح'; end if;
  if p_order_type not in ('takeaway','delivery') then raise exception 'نوع الطلب غير صحيح'; end if;
  if p_items is null or jsonb_array_length(p_items)=0 then raise exception 'لا توجد أصناف'; end if;
  if coalesce(trim(p_phone),'')='' then raise exception 'رقم الهاتف مطلوب'; end if;
  if p_order_type='delivery' and coalesce(trim(p_address),'')='' then raise exception 'العنوان مطلوب للتوصيل'; end if;
  perform set_config('exhibitions.current_tenant', p_tenant::text, true);

  v_fee := case when p_order_type='delivery' then (select coalesce(delivery_fee,0) from exhibitions.tenants where id=p_tenant) else 0 end;
  insert into exhibitions.table_sessions(tenant_id,table_id,order_type,customer_name,customer_phone,address,delivery_fee,guest_count,status)
    values(p_tenant,null,p_order_type,nullif(p_name,''),nullif(p_phone,''),nullif(p_address,''),v_fee,1,'open')
    returning id, session_no into v_sess, v_no;

  insert into exhibitions.orders(tenant_id,session_id,created_by,note,status)
    values(p_tenant,v_sess,null,coalesce(nullif(p_note,''),'طلب أونلاين'),'new') returning id, order_no into v_order, v_ono;

  for r in select * from jsonb_array_elements(p_items) loop
    select * into v_item from exhibitions.menu_items where id=(r->>'menu_item_id')::uuid and tenant_id=p_tenant and is_available;
    if not found then raise exception 'صنف غير متاح'; end if;
    v_qty := greatest(coalesce((r->>'qty')::int,1),1);
    v_delta := 0; v_opts := coalesce(r->'options','[]'::jsonb);
    for v_opt in select * from jsonb_array_elements(v_opts) loop
      v_delta := v_delta + coalesce((v_opt->>'price_delta')::numeric,0);
    end loop;
    v_line := v_qty*(v_item.price_sar + v_delta);
    insert into exhibitions.order_items(tenant_id,order_id,menu_item_id,name_snapshot,qty,unit_price_sar,options,line_total_sar,note)
      values(p_tenant,v_order,v_item.id,v_item.name,v_qty,v_item.price_sar,v_opts,v_line,r->>'note');
    v_total := v_total + v_line;
  end loop;
  update exhibitions.table_sessions set total_sar = total_sar + v_total where id=v_sess;
  return json_build_object('order_no',v_ono,'session_no',v_no,'items_total',v_total,'delivery_fee',v_fee);
end $function$;

grant execute on function exhibitions.restaurant_public_info(uuid) to anon, authenticated;
grant execute on function exhibitions.restaurant_online_order(uuid,text,text,text,text,jsonb,text) to anon, authenticated;
