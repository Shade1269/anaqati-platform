-- ============================================================
-- إلغاء صنف (Void) بسبب + بصلاحية المدير | Migration 032
-- الإلغاء للمالك أو مدير can_manage_restaurant فقط (النادل لا يلغي).
-- السبب إلزامي، يُسجَّل في التدقيق، يُخصم من إجمالي الجلسة، ويُستثنى من
-- الفاتورة وتكلفة المبيعات والمطبخ والتقارير.
-- ملاحظة: نسخة close_table_bill و restaurant_report و kds_list أدناه
-- تستثني الأصناف الملغاة (إعادة إنشاء شاملة).
-- ============================================================

alter table exhibitions.order_items
  add column if not exists voided boolean not null default false,
  add column if not exists void_reason text,
  add column if not exists voided_by uuid references exhibitions.profiles(id) on delete set null,
  add column if not exists voided_at timestamptz;

create or replace function exhibitions.void_order_item(p_item_id uuid, p_reason text, p_token uuid default null)
returns void language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_tenant uuid; v_line numeric; v_session uuid; v_sess_status text;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if p_token is not null then raise exception 'إلغاء الصنف يتطلب موافقة المدير'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'سبب الإلغاء مطلوب'; end if;
  select oi.line_total_sar, o.session_id into v_line, v_session
    from exhibitions.order_items oi
    join exhibitions.orders o on o.id=oi.order_id
    where oi.id=p_item_id and oi.tenant_id=v_tenant and not coalesce(oi.voided,false);
  if v_session is null then raise exception 'الصنف غير موجود أو ملغى مسبقًا'; end if;
  select status into v_sess_status from exhibitions.table_sessions where id=v_session and tenant_id=v_tenant;
  if v_sess_status not in ('open','billing') then raise exception 'لا يمكن الإلغاء بعد إقفال الفاتورة'; end if;
  update exhibitions.order_items
    set voided=true, void_reason=p_reason, voided_by=v_actor, voided_at=now()
    where id=p_item_id;
  update exhibitions.table_sessions set total_sar = greatest(total_sar - coalesce(v_line,0), 0) where id=v_session;
  perform exhibitions._audit('void_item','order_items',p_item_id,null,
    jsonb_build_object('reason',p_reason,'amount',v_line,'session_id',v_session));
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
            'unit_price',oi.unit_price_sar,'options',oi.options,'line_total',oi.line_total_sar,'note',oi.note,
            'voided',coalesce(oi.voided,false),'void_reason',oi.void_reason) order by oi.id),'[]')
          from exhibitions.order_items oi where oi.order_id=o.id)
      ) order by o.created_at),'[]')
      from exhibitions.orders o where o.session_id=p_session_id and o.tenant_id=v_tenant and o.status<>'cancelled')
  ));
end $function$;

create or replace function exhibitions.close_table_bill(
  p_session_id uuid, p_payment_method text default 'cash',
  p_discount_type text default 'none', p_discount_value numeric default 0,
  p_tip numeric default 0, p_token uuid default null)
returns json language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_tenant uuid; v_table uuid; v_subtotal numeric; v_cash text; v_pm exhibitions.payment_method;
        v_cogs numeric := 0; rec record; v_lines jsonb; v_fee numeric; v_shift uuid;
        v_disc numeric := 0; v_net numeric; v_svc_pct numeric; v_tax_pct numeric;
        v_service numeric := 0; v_tax numeric := 0; v_tip numeric := 0; v_grand numeric;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if p_token is not null then perform exhibitions._emp_require(v_actor,'can_waiter'); end if;
  select table_id, coalesce(delivery_fee,0) into v_table, v_fee from exhibitions.table_sessions
    where id=p_session_id and tenant_id=v_tenant and status in ('open','billing');
  if not found then raise exception 'الجلسة غير موجودة أو مقفلة مسبقًا'; end if;
  v_pm := coalesce(nullif(p_payment_method,''),'cash')::exhibitions.payment_method;
  select id into v_shift from exhibitions.cashier_shifts where tenant_id=v_tenant and status='open' limit 1;
  select coalesce(service_charge_pct,0), coalesce(tax_pct,0) into v_svc_pct, v_tax_pct from exhibitions.tenants where id=v_tenant;

  select coalesce(sum(oi.line_total_sar),0) into v_subtotal
    from exhibitions.order_items oi join exhibitions.orders o on o.id=oi.order_id
    where o.session_id=p_session_id and o.tenant_id=v_tenant and o.status<>'cancelled' and not coalesce(oi.voided,false);

  if p_discount_type='percent' then v_disc := round(v_subtotal * greatest(coalesce(p_discount_value,0),0)/100, 2);
  elsif p_discount_type='amount' then v_disc := least(greatest(coalesce(p_discount_value,0),0), v_subtotal);
  else v_disc := 0; end if;
  v_net := v_subtotal - v_disc;
  v_service := round(v_net * v_svc_pct/100, 2);
  v_tax := round((v_net + v_service) * v_tax_pct/100, 2);
  v_tip := greatest(coalesce(p_tip,0),0);
  v_grand := v_net + v_service + v_tax + v_tip + coalesce(v_fee,0);

  for rec in
    select ri.ingredient_id as ing, sum(oi.qty*ri.qty) as used, max(g.cost_per_unit) as cost
    from exhibitions.order_items oi
    join exhibitions.orders o on o.id=oi.order_id
    join exhibitions.recipe_items ri on ri.menu_item_id=oi.menu_item_id and ri.tenant_id=v_tenant
    join exhibitions.ingredients g on g.id=ri.ingredient_id
    where o.session_id=p_session_id and o.tenant_id=v_tenant and o.status<>'cancelled' and not coalesce(oi.voided,false)
    group by ri.ingredient_id
  loop
    update exhibitions.ingredients set current_qty = current_qty - rec.used where id=rec.ing and tenant_id=v_tenant;
    insert into exhibitions.ingredient_movements(tenant_id,ingredient_id,delta,reason,ref_table,ref_id,created_by)
      values(v_tenant,rec.ing,-rec.used,'usage','table_sessions',p_session_id,v_actor);
    v_cogs := v_cogs + rec.used*coalesce(rec.cost,0);
  end loop;

  v_cash := case when v_pm='card' then '1020' else '1010' end;
  v_lines := jsonb_build_array(
    jsonb_build_object('account',v_cash,'debit',v_grand,'credit',0),
    jsonb_build_object('account','4040','debit',0,'credit',v_net + v_service + coalesce(v_fee,0)));
  if v_tax > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account','2300','debit',0,'credit',v_tax));
  end if;
  if v_tip > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account','2310','debit',0,'credit',v_tip));
  end if;
  if v_cogs > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account','5010','debit',v_cogs,'credit',0),
      jsonb_build_object('account','1100','debit',0,'credit',v_cogs));
  end if;
  if v_grand > 0 or v_cogs > 0 then
    perform exhibitions._post(current_date,'فاتورة مطعم','table_sessions',p_session_id,v_lines);
  end if;

  update exhibitions.table_sessions
    set status='paid', total_sar=v_subtotal, payment_method=v_pm, closed_by=v_actor, closed_at=now(), shift_id=v_shift,
        discount_amount=v_disc, service_amount=v_service, tax_amount=v_tax, tip_amount=v_tip, grand_total=v_grand
    where id=p_session_id;
  update exhibitions.orders set status='served'
    where session_id=p_session_id and tenant_id=v_tenant and status in ('new','preparing','ready');
  if v_table is not null then
    update exhibitions.dining_tables set status='free' where id=v_table and tenant_id=v_tenant;
  end if;
  return json_build_object('session_id',p_session_id,'subtotal',v_subtotal,'discount',v_disc,'service',v_service,
    'tax',v_tax,'tip',v_tip,'delivery_fee',v_fee,'charged',v_grand,'cogs',v_cogs,'payment_method',v_pm);
end $function$;

create or replace function exhibitions.kds_list(p_token uuid default null)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_tenant uuid;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if p_token is not null then perform exhibitions._emp_require(v_actor,'can_kitchen'); end if;
  return (select coalesce(json_agg(json_build_object(
     'id',o.id,'order_no',o.order_no,'status',o.status,'created_at',o.created_at,'note',o.note,
     'table_label',dt.label,
     'items',(select coalesce(json_agg(json_build_object('name',oi.name_snapshot,'qty',oi.qty,'options',oi.options,'note',oi.note) order by oi.id),'[]')
        from exhibitions.order_items oi where oi.order_id=o.id and not coalesce(oi.voided,false))
    ) order by o.created_at),'[]')
   from exhibitions.orders o
   join exhibitions.table_sessions ts on ts.id=o.session_id
   join exhibitions.dining_tables dt on dt.id=ts.table_id
   where o.tenant_id=v_tenant and o.status in ('new','preparing','ready'));
end $function$;

create or replace function exhibitions.restaurant_report(p_from date, p_to date)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
declare v_tenant uuid; v_to timestamptz; v_from timestamptz;
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_manage_restaurant')) then raise exception 'غير مصرّح'; end if;
  v_tenant := exhibitions.current_tenant_id();
  v_from := p_from::timestamptz;
  v_to := (p_to + 1)::timestamptz;
  return json_build_object(
    'summary', (select json_build_object(
        'bills', count(*),
        'sales', coalesce(sum(amt),0),
        'avg_ticket', case when count(*)>0 then round(coalesce(sum(amt),0)/count(*),2) else 0 end,
        'dine_in', coalesce(sum(case when order_type='dine_in' then amt else 0 end),0),
        'takeaway', coalesce(sum(case when order_type='takeaway' then amt else 0 end),0),
        'delivery', coalesce(sum(case when order_type='delivery' then amt else 0 end),0),
        'cash', coalesce(sum(case when payment_method='cash' then amt else 0 end),0),
        'card', coalesce(sum(case when payment_method='card' then amt else 0 end),0),
        'discounts', coalesce(sum(discount_amount),0),
        'service', coalesce(sum(service_amount),0),
        'tax', coalesce(sum(tax_amount),0),
        'tips', coalesce(sum(tip_amount),0))
      from (select *, coalesce(nullif(grand_total,0), total_sar+coalesce(delivery_fee,0)) amt
            from exhibitions.table_sessions
            where tenant_id=v_tenant and status='paid' and closed_at>=v_from and closed_at<v_to) q),
    'cogs', (select coalesce(sum(l.debit),0) from exhibitions.journal_lines l
              join exhibitions.journal_entries j on j.id=l.entry_id
              where j.tenant_id=v_tenant and j.source_table='table_sessions' and l.account_code='5010'
                and j.entry_date>=p_from and j.entry_date<=p_to),
    'top_items', (select coalesce(json_agg(x),'[]') from (
        select oi.name_snapshot as name, sum(oi.qty)::int as qty, sum(oi.line_total_sar) as revenue
        from exhibitions.order_items oi
        join exhibitions.orders o on o.id=oi.order_id
        join exhibitions.table_sessions ts on ts.id=o.session_id
        where ts.tenant_id=v_tenant and ts.status='paid' and ts.closed_at>=v_from and ts.closed_at<v_to
          and o.status<>'cancelled' and not coalesce(oi.voided,false)
        group by oi.name_snapshot order by qty desc limit 15) x),
    'by_category', (select coalesce(json_agg(x),'[]') from (
        select coalesce(mc.name,'بدون تصنيف') as name, sum(oi.qty)::int as qty, sum(oi.line_total_sar) as revenue
        from exhibitions.order_items oi
        join exhibitions.orders o on o.id=oi.order_id
        join exhibitions.table_sessions ts on ts.id=o.session_id
        left join exhibitions.menu_items mi on mi.id=oi.menu_item_id
        left join exhibitions.menu_categories mc on mc.id=mi.category_id
        where ts.tenant_id=v_tenant and ts.status='paid' and ts.closed_at>=v_from and ts.closed_at<v_to
          and o.status<>'cancelled' and not coalesce(oi.voided,false)
        group by coalesce(mc.name,'بدون تصنيف') order by revenue desc) x),
    'by_hour', (select coalesce(json_agg(x order by (x->>'hour')::int),'[]') from (
        select json_build_object('hour',extract(hour from closed_at)::int,'bills',count(*),
          'sales',sum(coalesce(nullif(grand_total,0),total_sar+coalesce(delivery_fee,0)))) as x
        from exhibitions.table_sessions
        where tenant_id=v_tenant and status='paid' and closed_at>=v_from and closed_at<v_to
        group by extract(hour from closed_at)::int) x),
    'staff', (select coalesce(json_agg(x),'[]') from (
        select coalesce(pr.full_name,'—') as name, count(*)::int as bills,
          sum(coalesce(nullif(ts.grand_total,0),ts.total_sar+coalesce(ts.delivery_fee,0))) as sales
        from exhibitions.table_sessions ts
        left join exhibitions.profiles pr on pr.id=coalesce(ts.closed_by, ts.opened_by)
        where ts.tenant_id=v_tenant and ts.status='paid' and ts.closed_at>=v_from and ts.closed_at<v_to
        group by coalesce(pr.full_name,'—') order by sales desc) x)
  );
end $function$;

grant execute on function exhibitions.void_order_item(uuid,text,uuid) to authenticated;
