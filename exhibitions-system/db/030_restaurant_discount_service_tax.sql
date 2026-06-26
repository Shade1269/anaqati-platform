-- ============================================================
-- خصم + خدمة + ضريبة + إكرامية على فاتورة المطعم | Migration 030
-- خصم على الأصناف، رسم خدمة %، ضريبة % (مستحقة كالتزام)، إكرامية (مستحقة).
-- نِسَب الخدمة/الضريبة تُضبط مرة على مستوى المطعم وتُطبّق تلقائيًا.
-- ============================================================

insert into exhibitions.accounts(code,name,type,sort) values
  ('2300','ضريبة القيمة المضافة المستحقة','liability', 2300),
  ('2310','إكراميات مستحقة','liability', 2310)
on conflict (code) do nothing;

alter table exhibitions.tenants
  add column if not exists service_charge_pct numeric(6,3) not null default 0,
  add column if not exists tax_pct numeric(6,3) not null default 0;

alter table exhibitions.table_sessions
  add column if not exists discount_amount numeric(14,2) not null default 0,
  add column if not exists service_amount  numeric(14,2) not null default 0,
  add column if not exists tax_amount      numeric(14,2) not null default 0,
  add column if not exists tip_amount      numeric(14,2) not null default 0,
  add column if not exists grand_total     numeric(14,2) not null default 0;

create or replace function exhibitions.restaurant_settings(p_token uuid default null)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_tenant uuid;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  return (select json_build_object('service_pct',coalesce(service_charge_pct,0),'tax_pct',coalesce(tax_pct,0))
          from exhibitions.tenants where id=v_tenant);
end $function$;

create or replace function exhibitions.set_restaurant_settings(p_service_pct numeric, p_tax_pct numeric)
returns void language plpgsql security definer set search_path to 'exhibitions','public' as $function$
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_manage_restaurant')) then raise exception 'غير مصرّح'; end if;
  update exhibitions.tenants set
    service_charge_pct = greatest(coalesce(p_service_pct,0),0),
    tax_pct = greatest(coalesce(p_tax_pct,0),0)
  where id = exhibitions.current_tenant_id();
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
    where o.session_id=p_session_id and o.tenant_id=v_tenant and o.status<>'cancelled';

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

create or replace function exhibitions._shift_z(p_shift_id uuid, p_tenant uuid)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
declare sh exhibitions.cashier_shifts; v_agg record; v_expected numeric;
begin
  select * into sh from exhibitions.cashier_shifts where id=p_shift_id and tenant_id=p_tenant;
  if not found then raise exception 'الوردية غير موجودة'; end if;
  select
    count(*) as bills,
    coalesce(sum(amt),0) as sales,
    coalesce(sum(case when payment_method='cash' then amt else 0 end),0) as cash_sales,
    coalesce(sum(case when payment_method='card' then amt else 0 end),0) as card_sales,
    coalesce(sum(case when order_type='dine_in' then amt else 0 end),0) as dine_in,
    coalesce(sum(case when order_type='takeaway' then amt else 0 end),0) as takeaway,
    coalesce(sum(case when order_type='delivery' then amt else 0 end),0) as delivery,
    coalesce(sum(coalesce(delivery_fee,0)),0) as delivery_fees,
    coalesce(sum(discount_amount),0) as discounts,
    coalesce(sum(tax_amount),0) as tax,
    coalesce(sum(tip_amount),0) as tips
  into v_agg
  from (
    select *, coalesce(nullif(grand_total,0), total_sar+coalesce(delivery_fee,0)) as amt
    from exhibitions.table_sessions
    where shift_id=p_shift_id and tenant_id=p_tenant and status='paid'
  ) q;
  v_expected := coalesce(sh.opening_float,0) + v_agg.cash_sales;
  return json_build_object(
    'id',sh.id,'status',sh.status,'opened_at',sh.opened_at,'closed_at',sh.closed_at,
    'opening_float',sh.opening_float,
    'opened_by',(select full_name from exhibitions.profiles where id=sh.opened_by),
    'closed_by',(select full_name from exhibitions.profiles where id=sh.closed_by),
    'bills',v_agg.bills,'sales',v_agg.sales,'cash_sales',v_agg.cash_sales,'card_sales',v_agg.card_sales,
    'dine_in',v_agg.dine_in,'takeaway',v_agg.takeaway,'delivery',v_agg.delivery,'delivery_fees',v_agg.delivery_fees,
    'discounts',v_agg.discounts,'tax',v_agg.tax,'tips',v_agg.tips,
    'expected_cash',v_expected,'declared_cash',sh.declared_cash,
    'variance',case when sh.declared_cash is null then null else sh.declared_cash - v_expected end,
    'note',sh.note);
end $function$;

grant execute on function exhibitions.restaurant_settings(uuid) to authenticated;
grant execute on function exhibitions.set_restaurant_settings(numeric,numeric) to authenticated;
