-- ============================================================
-- منيو QR للطلب الذاتي من الطاولة (عام، بلا تسجيل دخول) | Migration 033
-- يمسح الزبون رمز QR على طاولته => يرى المنيو ويرسل طلبًا يصل للمطبخ.
-- الطلب يُربط بجلسة الطاولة (تُفتح إن لم تكن مفتوحة) ويديره النادل/الكاشير.
-- ============================================================

create or replace function exhibitions.qr_info(p_tenant uuid, p_table uuid)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
declare t record; v_label text;
begin
  select id,brand_name,name,logo_url,primary_color,business_type,status,currency,secondary_currency,fx_rate
    into t from exhibitions.tenants where id=p_tenant;
  if not found or t.status<>'active' or coalesce(t.business_type,'retail')<>'restaurant' then
    raise exception 'غير متاح'; end if;
  select label into v_label from exhibitions.dining_tables where id=p_table and tenant_id=p_tenant and is_active;
  if v_label is null then raise exception 'الطاولة غير موجودة'; end if;
  return json_build_object('brand_name',coalesce(t.brand_name,t.name),'logo_url',t.logo_url,
    'primary_color',t.primary_color,'currency',coalesce(t.currency,'SAR'),
    'secondary_currency',t.secondary_currency,'fx_rate',t.fx_rate,'table_label',v_label);
end $function$;

create or replace function exhibitions.qr_menu(p_tenant uuid)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
begin
  if not exists(select 1 from exhibitions.tenants where id=p_tenant and status='active' and business_type='restaurant') then
    raise exception 'غير متاح'; end if;
  return (select coalesce(json_agg(json_build_object(
      'id',c.id,'name',c.name,'sort',c.sort,'is_active',c.is_active,
      'items',(select coalesce(json_agg(json_build_object(
          'id',i.id,'name',i.name,'price',i.price_sar,'description',i.description,'image_url',i.image_url,
          'is_available',i.is_available,'sort',i.sort,
          'options',(select coalesce(json_agg(json_build_object('id',o.id,'group',o.group_name,'name',o.name,'price_delta',o.price_delta_sar) order by o.sort,o.name),'[]')
             from exhibitions.menu_item_options o where o.item_id=i.id)
        ) order by i.sort,i.name),'[]')
        from exhibitions.menu_items i where i.category_id=c.id and i.tenant_id=p_tenant and i.is_available)
    ) order by c.sort,c.name),'[]')
    from exhibitions.menu_categories c where c.tenant_id=p_tenant and c.is_active);
end $function$;

create or replace function exhibitions.qr_place_order(p_tenant uuid, p_table uuid, p_items jsonb, p_note text default null)
returns json language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_sess uuid; v_no text; v_order uuid; v_ono text; r jsonb; v_item exhibitions.menu_items;
        v_opts jsonb; v_opt jsonb; v_delta numeric; v_qty int; v_line numeric; v_total numeric:=0;
begin
  if not exists(select 1 from exhibitions.tenants where id=p_tenant and status='active' and business_type='restaurant') then
    raise exception 'غير متاح'; end if;
  if not exists(select 1 from exhibitions.dining_tables where id=p_table and tenant_id=p_tenant and is_active) then
    raise exception 'الطاولة غير موجودة'; end if;
  if p_items is null or jsonb_array_length(p_items)=0 then raise exception 'لا توجد أصناف'; end if;
  perform set_config('exhibitions.current_tenant', p_tenant::text, true);

  select id, session_no into v_sess, v_no from exhibitions.table_sessions
    where table_id=p_table and tenant_id=p_tenant and status in ('open','billing') order by opened_at limit 1;
  if v_sess is null then
    insert into exhibitions.table_sessions(tenant_id,table_id,order_type,guest_count,status)
      values(p_tenant,p_table,'dine_in',1,'open') returning id, session_no into v_sess, v_no;
    update exhibitions.dining_tables set status='open' where id=p_table and tenant_id=p_tenant;
  end if;

  insert into exhibitions.orders(tenant_id,session_id,created_by,note,status)
    values(p_tenant,v_sess,null,coalesce(nullif(p_note,''),'طلب ذاتي (QR)'),'new') returning id, order_no into v_order, v_ono;

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
  return json_build_object('order_no',v_ono,'session_no',v_no,'added',v_total);
end $function$;

grant execute on function exhibitions.qr_info(uuid,uuid) to anon, authenticated;
grant execute on function exhibitions.qr_menu(uuid) to anon, authenticated;
grant execute on function exhibitions.qr_place_order(uuid,uuid,jsonb,text) to anon, authenticated;
