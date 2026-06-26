-- ============================================================
-- إصلاحات تدقيق الواجهة (وكلاء) | Migration 041
-- 1) حصر عرض الطاولات/الجلسات على can_waiter في مسار الموظف (دفاع متعمّق)
-- 2) توليد slug تلقائيًا عند تفعيل المتجر إن كان فارغًا (المتجر كان يُفعّل بلا رابط)
-- (restaurant_tables/quick_sessions/session_detail أُعيد إنشاؤها مع حارس can_waiter)
-- ============================================================

create or replace function exhibitions.restaurant_tables(p_token uuid default null)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_tenant uuid;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if p_token is not null then perform exhibitions._emp_require(v_actor,'can_waiter'); end if;
  return (select coalesce(json_agg(json_build_object(
      'id',d.id,'label',d.label,'section',d.section,'seats',d.seats,'status',d.status,'is_active',d.is_active,
      'sessions',(select coalesce(json_agg(json_build_object(
          'id',s.id,'session_no',s.session_no,'total',s.total_sar,'guest_count',s.guest_count,'opened_at',s.opened_at) order by s.opened_at),'[]')
        from exhibitions.table_sessions s where s.table_id=d.id and s.status in ('open','billing'))
    ) order by d.section nulls first, d.label),'[]')
    from exhibitions.dining_tables d where d.tenant_id=v_tenant and d.is_active);
end $function$;

create or replace function exhibitions.quick_sessions(p_token uuid default null)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_tenant uuid;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if p_token is not null then perform exhibitions._emp_require(v_actor,'can_waiter'); end if;
  return (select coalesce(json_agg(json_build_object(
      'id',s.id,'session_no',s.session_no,'order_type',s.order_type,'status',s.status,
      'customer_name',s.customer_name,'customer_phone',s.customer_phone,'address',s.address,
      'delivery_fee',s.delivery_fee,'total',s.total_sar,'opened_at',s.opened_at) order by s.opened_at desc),'[]')
    from exhibitions.table_sessions s
    where s.tenant_id=v_tenant and s.table_id is null and s.status in ('open','billing'));
end $function$;

create or replace function exhibitions.session_detail(p_session_id uuid, p_token uuid default null)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_tenant uuid;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if p_token is not null then perform exhibitions._emp_require(v_actor,'can_waiter'); end if;
  return (select json_build_object(
    'session',(select row_to_json(s) from (
        select ts.id,ts.session_no,ts.status,ts.guest_count,ts.total_sar,ts.opened_at,
               ts.order_type, ts.customer_name, ts.customer_phone, ts.address, ts.delivery_fee,
               dt.label as table_label, dt.section
          from exhibitions.table_sessions ts left join exhibitions.dining_tables dt on dt.id=ts.table_id
         where ts.id=p_session_id and ts.tenant_id=v_tenant) s),
    'orders',(select coalesce(json_agg(json_build_object(
        'id',o.id,'order_no',o.order_no,'status',o.status,'note',o.note,'created_at',o.created_at,
        'items',(select coalesce(json_agg(json_build_object('id',oi.id,'name',oi.name_snapshot,'qty',oi.qty,
            'unit_price',oi.unit_price_sar,'options',oi.options,'line_total',oi.line_total_sar,'note',oi.note,
            'voided',coalesce(oi.voided,false),'void_reason',oi.void_reason) order by oi.id),'[]')
          from exhibitions.order_items oi where oi.order_id=o.id)
      ) order by o.created_at),'[]')
      from exhibitions.orders o where o.session_id=p_session_id and o.tenant_id=v_tenant and o.status<>'cancelled')
  ));
end $function$;

create or replace function exhibitions.update_store_settings(p_enabled boolean, p_description text, p_whatsapp text, p_delivery_fee numeric, p_cod boolean)
returns void language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_t uuid := exhibitions.current_tenant_id(); v_base text; v_slug text; v_n int := 0;
begin
  if not exhibitions._im_can('can_manage_store') then raise exception 'غير مصرّح'; end if;
  update exhibitions.tenants set store_enabled=coalesce(p_enabled,store_enabled),
    store_description=p_description, store_whatsapp=p_whatsapp,
    delivery_fee=coalesce(p_delivery_fee,delivery_fee), cod_enabled=coalesce(p_cod,cod_enabled)
  where id=v_t;
  if coalesce(p_enabled,false) and (select slug from exhibitions.tenants where id=v_t) is null then
    v_base := trim(both '-' from lower(regexp_replace(
       coalesce((select nullif(brand_name,'') from exhibitions.tenants where id=v_t),
                (select name from exhibitions.tenants where id=v_t),'store'),'[^a-z0-9؀-ۿ]+','-','g')));
    if v_base='' then v_base := 'store'; end if;
    v_slug := v_base;
    while exists(select 1 from exhibitions.tenants where slug=v_slug and id<>v_t) loop
      v_n := v_n + 1; v_slug := v_base||'-'||v_n;
    end loop;
    update exhibitions.tenants set slug=v_slug where id=v_t;
  end if;
end $function$;
