-- ============================================================
-- فرض صلاحيات الموظف في دوال التوكن | Migration 027
-- بيع/إرجاع/طلب بضاعة/سحب/تسليم (تجزئة) + نادل/مطبخ (مطاعم).
-- يُفرض فقط على مسار الموظف (p_token غير فارغ). كما يُصحّح نطاق المستأجر
-- في إشعارات request_stock/submit_settlement.
-- ============================================================

create or replace function exhibitions.create_sale(p_token uuid, p_branch_id uuid, p_payment_method text, p_items jsonb)
returns json language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_emp uuid; v_sale uuid; r jsonb; v_total numeric:=0; v_cost numeric; v_qty int; v_price numeric; v_pid uuid;
begin
  v_emp := exhibitions._employee_from_token(p_token);
  perform exhibitions._emp_require(v_emp,'can_sell');
  insert into exhibitions.sales(branch_id,employee_id,payment_method,total_sar,status)
    values(p_branch_id,v_emp,p_payment_method::exhibitions.payment_method,0,'completed') returning id into v_sale;
  for r in select * from jsonb_array_elements(p_items) loop
    v_pid:=(r->>'product_id')::uuid; v_qty:=(r->>'qty')::int; v_price:=(r->>'unit_sale_price')::numeric;
    select cost_price_sar into v_cost from exhibitions.products where id=v_pid;
    insert into exhibitions.sale_items(sale_id,product_id,qty,unit_sale_price_sar,unit_cost_snapshot_sar)
      values(v_sale,v_pid,v_qty,v_price,coalesce(v_cost,0));
    perform exhibitions._move_stock(v_pid,v_qty,'employee_consignment',v_emp,null,null,'sale','sales',v_sale,v_emp);
    v_total := v_total + (v_qty*v_price);
  end loop;
  update exhibitions.sales set total_sar=v_total where id=v_sale;
  return json_build_object('sale_id',v_sale,'total',v_total);
end $function$;

create or replace function exhibitions.create_sale_return(p_token uuid, p_sale_id uuid, p_items jsonb, p_refund_method text default null)
returns uuid language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_emp uuid; v_branch uuid; v_ret uuid; r jsonb; v_refund numeric:=0; v_si exhibitions.sale_items; v_qty int;
begin
  v_emp := exhibitions._employee_from_token(p_token);
  perform exhibitions._emp_require(v_emp,'can_return');
  select branch_id into v_branch from exhibitions.sales where id=p_sale_id;
  if v_branch is null then raise exception 'الفاتورة غير موجودة'; end if;
  insert into exhibitions.sale_returns(sale_id,branch_id,employee_id,refund_amount_sar,refund_method)
    values(p_sale_id,v_branch,v_emp,0,nullif(p_refund_method,'')::exhibitions.payment_method) returning id into v_ret;
  for r in select * from jsonb_array_elements(p_items) loop
    v_qty:=(r->>'qty')::int;
    select * into v_si from exhibitions.sale_items where id=(r->>'sale_item_id')::uuid;
    insert into exhibitions.sale_return_items(return_id,sale_item_id,qty) values(v_ret,v_si.id,v_qty);
    perform exhibitions._move_stock(v_si.product_id,v_qty,null,null,'employee_consignment',v_emp,
      'customer_return','sale_returns',v_ret,v_emp);
    v_refund := v_refund + (v_qty*v_si.unit_sale_price_sar);
  end loop;
  update exhibitions.sale_returns set refund_amount_sar=v_refund where id=v_ret;
  return v_ret;
end $function$;

create or replace function exhibitions.request_stock(p_token uuid, p_branch_id uuid, p_items jsonb)
returns uuid language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_emp uuid; v_req uuid; r jsonb;
begin
  v_emp := exhibitions._employee_from_token(p_token);
  perform exhibitions._emp_require(v_emp,'can_request_stock');
  insert into exhibitions.stock_requests(branch_id,requested_by,status)
    values(p_branch_id,v_emp,'pending') returning id into v_req;
  for r in select * from jsonb_array_elements(p_items) loop
    insert into exhibitions.stock_request_items(request_id,product_id,qty_requested)
      values(v_req,(r->>'product_id')::uuid,(r->>'qty')::int);
  end loop;
  insert into exhibitions.notifications(recipient_id,type,title,body,ref_table,ref_id)
    select id,'stock_request','طلب معرض جديد','وصل طلب بضاعة جديد بانتظار المراجعة','stock_requests',v_req
      from exhibitions.profiles where role in ('inventory_manager','admin') and status='active'
        and tenant_id=exhibitions.current_tenant_id();
  return v_req;
end $function$;

create or replace function exhibitions.withdraw_consignment(p_token uuid, p_branch_id uuid, p_items jsonb)
returns void language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_emp uuid; r jsonb; v_id uuid;
begin
  v_emp := exhibitions._employee_from_token(p_token);
  perform exhibitions._emp_require(v_emp,'can_withdraw');
  for r in select * from jsonb_array_elements(p_items) loop
    insert into exhibitions.consignment_withdrawals(employee_id,branch_id,product_id,qty)
      values(v_emp,p_branch_id,(r->>'product_id')::uuid,(r->>'qty')::int) returning id into v_id;
    perform exhibitions._move_stock((r->>'product_id')::uuid,(r->>'qty')::int,
      'branch',p_branch_id,'employee_consignment',v_emp,'consignment_out','consignment_withdrawals',v_id,v_emp);
  end loop;
end $function$;

create or replace function exhibitions.submit_settlement(p_token uuid, p_declared_cash numeric, p_declared_card numeric)
returns uuid language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_emp uuid; v_from date; v_id uuid;
begin
  v_emp := exhibitions._employee_from_token(p_token);
  perform exhibitions._emp_require(v_emp,'can_settle');
  select max(period_to) into v_from from exhibitions.consignment_settlements where employee_id=v_emp and status='accepted';
  insert into exhibitions.consignment_settlements(employee_id,period_from,period_to,declared_cash_sar,declared_card_sar,status)
    values(v_emp,coalesce(v_from,(current_date - interval '1 year')::date),current_date,
           coalesce(p_declared_cash,0),coalesce(p_declared_card,0),'pending') returning id into v_id;
  insert into exhibitions.notifications(recipient_id,type,title,body,ref_table,ref_id)
    select id,'settlement','تسليم عهدة جديد','موظف سلّم عهدة بانتظار التأكيد','consignment_settlements',v_id
      from exhibitions.profiles where role='admin' and status='active'
        and tenant_id=exhibitions.current_tenant_id();
  return v_id;
end $function$;

create or replace function exhibitions.open_table(p_table_id uuid, p_guests integer default 1, p_token uuid default null)
returns json language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_tenant uuid; v_sess uuid; v_no text;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if p_token is not null then perform exhibitions._emp_require(v_actor,'can_waiter'); end if;
  if not exists(select 1 from exhibitions.dining_tables where id=p_table_id and tenant_id=v_tenant and is_active) then
    raise exception 'الطاولة غير موجودة';
  end if;
  select id, session_no into v_sess, v_no from exhibitions.table_sessions
    where table_id=p_table_id and tenant_id=v_tenant and status in ('open','billing')
    order by opened_at limit 1;
  if v_sess is not null then
    return json_build_object('session_id',v_sess,'session_no',v_no,'reused',true);
  end if;
  insert into exhibitions.table_sessions(tenant_id,table_id,guest_count,opened_by,status)
    values(v_tenant,p_table_id,greatest(coalesce(p_guests,1),1),v_actor,'open')
    returning id, session_no into v_sess, v_no;
  update exhibitions.dining_tables set status='open' where id=p_table_id and tenant_id=v_tenant;
  return json_build_object('session_id',v_sess,'session_no',v_no,'reused',false);
end $function$;

create or replace function exhibitions.add_order(p_session_id uuid, p_items jsonb, p_note text default null, p_token uuid default null)
returns json language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_tenant uuid; v_order uuid; v_no text; r jsonb; v_item exhibitions.menu_items;
        v_opts jsonb; v_opt jsonb; v_delta numeric; v_qty int; v_line numeric; v_total numeric:=0;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if p_token is not null then perform exhibitions._emp_require(v_actor,'can_waiter'); end if;
  if not exists(select 1 from exhibitions.table_sessions where id=p_session_id and tenant_id=v_tenant and status='open') then
    raise exception 'الجلسة غير مفتوحة';
  end if;
  if p_items is null or jsonb_array_length(p_items)=0 then raise exception 'لا توجد أصناف'; end if;
  insert into exhibitions.orders(tenant_id,session_id,created_by,note,status)
    values(v_tenant,p_session_id,v_actor,p_note,'new') returning id, order_no into v_order, v_no;
  for r in select * from jsonb_array_elements(p_items) loop
    select * into v_item from exhibitions.menu_items where id=(r->>'menu_item_id')::uuid and tenant_id=v_tenant and is_available;
    if not found then raise exception 'صنف غير متاح'; end if;
    v_qty := greatest(coalesce((r->>'qty')::int,1),1);
    v_delta := 0; v_opts := coalesce(r->'options','[]'::jsonb);
    for v_opt in select * from jsonb_array_elements(v_opts) loop
      v_delta := v_delta + coalesce((v_opt->>'price_delta')::numeric,0);
    end loop;
    v_line := v_qty*(v_item.price_sar + v_delta);
    insert into exhibitions.order_items(tenant_id,order_id,menu_item_id,name_snapshot,qty,unit_price_sar,options,line_total_sar,note)
      values(v_tenant,v_order,v_item.id,v_item.name,v_qty,v_item.price_sar,v_opts,v_line,r->>'note');
    v_total := v_total + v_line;
  end loop;
  update exhibitions.table_sessions set total_sar = total_sar + v_total where id=p_session_id;
  return json_build_object('order_id',v_order,'order_no',v_no,'added',v_total);
end $function$;

create or replace function exhibitions.close_table_bill(p_session_id uuid, p_payment_method text default 'cash', p_token uuid default null)
returns json language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_tenant uuid; v_table uuid; v_total numeric; v_cash text; v_pm exhibitions.payment_method;
        v_cogs numeric := 0; rec record; v_lines jsonb;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if p_token is not null then perform exhibitions._emp_require(v_actor,'can_waiter'); end if;
  select table_id into v_table from exhibitions.table_sessions
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
  v_cash := case when v_pm='card' then '1020' else '1010' end;
  v_lines := jsonb_build_array(
    jsonb_build_object('account',v_cash,'debit',v_total,'credit',0),
    jsonb_build_object('account','4040','debit',0,'credit',v_total));
  if v_cogs > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account','5010','debit',v_cogs,'credit',0),
      jsonb_build_object('account','1100','debit',0,'credit',v_cogs));
  end if;
  if v_total > 0 or v_cogs > 0 then
    perform exhibitions._post(current_date,'فاتورة مطعم','table_sessions',p_session_id,v_lines);
  end if;
  update exhibitions.table_sessions
    set status='paid', total_sar=v_total, payment_method=v_pm, closed_by=v_actor, closed_at=now()
    where id=p_session_id;
  update exhibitions.orders set status='served'
    where session_id=p_session_id and tenant_id=v_tenant and status in ('new','preparing','ready');
  update exhibitions.dining_tables set status='free' where id=v_table and tenant_id=v_tenant;
  return json_build_object('session_id',p_session_id,'total',v_total,'cogs',v_cogs,'payment_method',v_pm);
end $function$;

create or replace function exhibitions.transfer_table(p_session_id uuid, p_to_table_id uuid, p_token uuid default null)
returns void language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_tenant uuid; v_from uuid;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if p_token is not null then perform exhibitions._emp_require(v_actor,'can_waiter'); end if;
  if exists(select 1 from exhibitions.table_sessions where table_id=p_to_table_id and tenant_id=v_tenant and status in ('open','billing')) then
    raise exception 'الطاولة الهدف مشغولة';
  end if;
  select table_id into v_from from exhibitions.table_sessions where id=p_session_id and tenant_id=v_tenant and status in ('open','billing');
  if not found then raise exception 'الجلسة غير موجودة'; end if;
  update exhibitions.table_sessions set table_id=p_to_table_id where id=p_session_id;
  update exhibitions.dining_tables set status='open' where id=p_to_table_id and tenant_id=v_tenant;
  update exhibitions.dining_tables set status='free' where id=v_from and tenant_id=v_tenant
    and not exists(select 1 from exhibitions.table_sessions where table_id=v_from and tenant_id=v_tenant and status in ('open','billing'));
end $function$;

create or replace function exhibitions.merge_tables(p_from_session_id uuid, p_into_session_id uuid, p_token uuid default null)
returns void language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_tenant uuid; v_from_table uuid; v_from_total numeric;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if p_token is not null then perform exhibitions._emp_require(v_actor,'can_waiter'); end if;
  if p_from_session_id = p_into_session_id then raise exception 'لا يمكن الدمج مع نفس الجلسة'; end if;
  if not exists(select 1 from exhibitions.table_sessions where id=p_into_session_id and tenant_id=v_tenant and status='open') then
    raise exception 'الجلسة الهدف غير مفتوحة';
  end if;
  select table_id, total_sar into v_from_table, v_from_total from exhibitions.table_sessions
    where id=p_from_session_id and tenant_id=v_tenant and status in ('open','billing');
  if not found then raise exception 'الجلسة المصدر غير موجودة'; end if;
  update exhibitions.orders set session_id=p_into_session_id where session_id=p_from_session_id and tenant_id=v_tenant;
  update exhibitions.table_sessions set total_sar = total_sar + coalesce(v_from_total,0) where id=p_into_session_id;
  update exhibitions.table_sessions set status='void', total_sar=0, closed_by=v_actor, closed_at=now() where id=p_from_session_id;
  update exhibitions.dining_tables set status='free' where id=v_from_table and tenant_id=v_tenant
    and not exists(select 1 from exhibitions.table_sessions where table_id=v_from_table and tenant_id=v_tenant and status in ('open','billing'));
end $function$;

create or replace function exhibitions.split_session(p_session_id uuid, p_item_ids uuid[], p_token uuid default null)
returns json language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_tenant uuid; v_table uuid; v_new uuid; v_no text; v_new_order uuid;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if p_token is not null then perform exhibitions._emp_require(v_actor,'can_waiter'); end if;
  if p_item_ids is null or array_length(p_item_ids,1) is null then raise exception 'لم تُحدّد أصناف'; end if;
  select table_id into v_table from exhibitions.table_sessions where id=p_session_id and tenant_id=v_tenant and status='open';
  if not found then raise exception 'الجلسة غير مفتوحة'; end if;
  insert into exhibitions.table_sessions(tenant_id,table_id,guest_count,opened_by,status)
    values(v_tenant,v_table,1,v_actor,'open') returning id, session_no into v_new, v_no;
  insert into exhibitions.orders(tenant_id,session_id,created_by,status,note)
    values(v_tenant,v_new,v_actor,'served','أصناف مقسومة') returning id into v_new_order;
  update exhibitions.order_items set order_id=v_new_order
    where id = any(p_item_ids) and tenant_id=v_tenant
      and order_id in (select id from exhibitions.orders where session_id=p_session_id and tenant_id=v_tenant);
  if not found then raise exception 'تعذّر نقل الأصناف'; end if;
  update exhibitions.table_sessions ts set total_sar = coalesce((
      select sum(oi.line_total_sar) from exhibitions.order_items oi join exhibitions.orders o on o.id=oi.order_id
      where o.session_id=ts.id and o.status<>'cancelled'),0)
    where ts.id in (p_session_id, v_new);
  return json_build_object('new_session_id',v_new,'new_session_no',v_no);
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
        from exhibitions.order_items oi where oi.order_id=o.id)
    ) order by o.created_at),'[]')
   from exhibitions.orders o
   join exhibitions.table_sessions ts on ts.id=o.session_id
   join exhibitions.dining_tables dt on dt.id=ts.table_id
   where o.tenant_id=v_tenant and o.status in ('new','preparing','ready'));
end $function$;

create or replace function exhibitions.kds_set_order_status(p_order_id uuid, p_status text, p_token uuid default null)
returns void language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_tenant uuid;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if p_token is not null then perform exhibitions._emp_require(v_actor,'can_kitchen'); end if;
  if p_status not in ('new','preparing','ready','served','cancelled') then raise exception 'حالة غير صحيحة'; end if;
  update exhibitions.orders set status=p_status where id=p_order_id and tenant_id=v_tenant;
end $function$;

create or replace function exhibitions.employee_login(p_phone text, p_access_code text)
returns json language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_profile exhibitions.profiles; v_token uuid; v_btype text; v_cur text; v_sec text; v_fx numeric; v_perms json;
begin
  select pr.* into v_profile from exhibitions.profiles pr
    join exhibitions.employee_details ed on ed.profile_id=pr.id
   where pr.phone=p_phone and ed.access_code=p_access_code
     and pr.role='employee' and pr.status='active' and ed.is_active=true;
  if not found then raise exception 'بيانات الدخول غير صحيحة'; end if;
  perform set_config('exhibitions.current_tenant', v_profile.tenant_id::text, true);
  insert into exhibitions.employee_sessions(profile_id, tenant_id) values(v_profile.id, v_profile.tenant_id) returning token into v_token;
  select business_type, currency, secondary_currency, fx_rate into v_btype, v_cur, v_sec, v_fx from exhibitions.tenants where id=v_profile.tenant_id;
  select json_build_object(
    'can_sell',coalesce(ep.can_sell,true),'can_return',coalesce(ep.can_return,true),
    'can_request_stock',coalesce(ep.can_request_stock,true),'can_withdraw',coalesce(ep.can_withdraw,true),
    'can_settle',coalesce(ep.can_settle,true),'can_waiter',coalesce(ep.can_waiter,true),
    'can_kitchen',coalesce(ep.can_kitchen,true))
   into v_perms
   from (select 1) s left join exhibitions.employee_permissions ep on ep.profile_id=v_profile.id;
  return json_build_object('token',v_token,'profile_id',v_profile.id,'full_name',v_profile.full_name,
    'business_type',coalesce(v_btype,'retail'),'currency',coalesce(v_cur,'SAR'),'secondary_currency',v_sec,'fx_rate',v_fx,
    'permissions',v_perms);
end $function$;
