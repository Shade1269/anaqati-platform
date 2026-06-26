-- ============================================================
-- أنواع طلبات المطعم: صالة/سفري/توصيل | Migration 028
-- جلسة بلا طاولة للسفري والتوصيل + بيانات الزبون ورسوم التوصيل.
-- ============================================================

alter table exhibitions.table_sessions
  add column if not exists order_type text not null default 'dine_in',
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists address text,
  add column if not exists delivery_fee numeric(14,2) not null default 0;

do $$ begin
  alter table exhibitions.table_sessions alter column table_id drop not null;
exception when others then null; end $$;

do $$ begin
  alter table exhibitions.table_sessions
    add constraint table_sessions_order_type_chk check (order_type in ('dine_in','takeaway','delivery'));
exception when duplicate_object then null; end $$;

create or replace function exhibitions.open_quick_session(
  p_order_type text, p_customer_name text default null, p_customer_phone text default null,
  p_address text default null, p_delivery_fee numeric default 0, p_token uuid default null)
returns json language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_tenant uuid; v_sess uuid; v_no text; v_fee numeric;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if p_token is not null then perform exhibitions._emp_require(v_actor,'can_waiter'); end if;
  if p_order_type not in ('takeaway','delivery') then raise exception 'نوع الطلب غير صحيح'; end if;
  v_fee := case when p_order_type='delivery' then greatest(coalesce(p_delivery_fee,0),0) else 0 end;
  insert into exhibitions.table_sessions(tenant_id,table_id,order_type,customer_name,customer_phone,address,delivery_fee,guest_count,opened_by,status)
    values(v_tenant,null,p_order_type,nullif(p_customer_name,''),nullif(p_customer_phone,''),nullif(p_address,''),v_fee,1,v_actor,'open')
    returning id, session_no into v_sess, v_no;
  return json_build_object('session_id',v_sess,'session_no',v_no);
end $function$;

create or replace function exhibitions.quick_sessions(p_token uuid default null)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_tenant uuid;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
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
            'unit_price',oi.unit_price_sar,'options',oi.options,'line_total',oi.line_total_sar,'note',oi.note) order by oi.id),'[]')
          from exhibitions.order_items oi where oi.order_id=o.id)
      ) order by o.created_at),'[]')
      from exhibitions.orders o where o.session_id=p_session_id and o.tenant_id=v_tenant and o.status<>'cancelled')
  ));
end $function$;

create or replace function exhibitions.close_table_bill(p_session_id uuid, p_payment_method text default 'cash', p_token uuid default null)
returns json language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_tenant uuid; v_table uuid; v_total numeric; v_cash text; v_pm exhibitions.payment_method;
        v_cogs numeric := 0; rec record; v_lines jsonb; v_fee numeric; v_charged numeric;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if p_token is not null then perform exhibitions._emp_require(v_actor,'can_waiter'); end if;
  select table_id, coalesce(delivery_fee,0) into v_table, v_fee from exhibitions.table_sessions
    where id=p_session_id and tenant_id=v_tenant and status in ('open','billing');
  if not found then raise exception 'الجلسة غير موجودة أو مقفلة مسبقًا'; end if;
  v_pm := coalesce(nullif(p_payment_method,''),'cash')::exhibitions.payment_method;
  select coalesce(sum(oi.line_total_sar),0) into v_total
    from exhibitions.order_items oi join exhibitions.orders o on o.id=oi.order_id
    where o.session_id=p_session_id and o.tenant_id=v_tenant and o.status<>'cancelled';
  for rec in
    select ri.ingredient_id as ing, sum(oi.qty*ri.qty) as used, max(g.cost_per_unit) as cost
    from exhibitions.order_items oi
    join exhibitions.orders o on o.id=oi.order_id
    join exhibitions.recipe_items ri on ri.menu_item_id=oi.menu_item_id and ri.tenant_id=v_tenant
    join exhibitions.ingredients g on g.id=ri.ingredient_id
    where o.session_id=p_session_id and o.tenant_id=v_tenant and o.status<>'cancelled'
    group by ri.ingredient_id
  loop
    update exhibitions.ingredients set current_qty = current_qty - rec.used where id=rec.ing and tenant_id=v_tenant;
    insert into exhibitions.ingredient_movements(tenant_id,ingredient_id,delta,reason,ref_table,ref_id,created_by)
      values(v_tenant,rec.ing,-rec.used,'usage','table_sessions',p_session_id,v_actor);
    v_cogs := v_cogs + rec.used*coalesce(rec.cost,0);
  end loop;
  v_charged := v_total + coalesce(v_fee,0);
  v_cash := case when v_pm='card' then '1020' else '1010' end;
  v_lines := jsonb_build_array(
    jsonb_build_object('account',v_cash,'debit',v_charged,'credit',0),
    jsonb_build_object('account','4040','debit',0,'credit',v_charged));
  if v_cogs > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account','5010','debit',v_cogs,'credit',0),
      jsonb_build_object('account','1100','debit',0,'credit',v_cogs));
  end if;
  if v_charged > 0 or v_cogs > 0 then
    perform exhibitions._post(current_date,'فاتورة مطعم','table_sessions',p_session_id,v_lines);
  end if;
  update exhibitions.table_sessions
    set status='paid', total_sar=v_total, payment_method=v_pm, closed_by=v_actor, closed_at=now()
    where id=p_session_id;
  update exhibitions.orders set status='served'
    where session_id=p_session_id and tenant_id=v_tenant and status in ('new','preparing','ready');
  if v_table is not null then
    update exhibitions.dining_tables set status='free' where id=v_table and tenant_id=v_tenant;
  end if;
  return json_build_object('session_id',p_session_id,'total',v_total,'delivery_fee',v_fee,'charged',v_charged,'cogs',v_cogs,'payment_method',v_pm);
end $function$;

grant execute on function exhibitions.open_quick_session(text,text,text,text,numeric,uuid) to authenticated;
grant execute on function exhibitions.quick_sessions(uuid) to authenticated;
