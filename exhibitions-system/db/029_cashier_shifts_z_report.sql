-- ============================================================
-- وردية الكاشير وتقرير Z | Migration 029
-- فتح وردية برصيد افتتاحي، ربط فواتير المطعم بها، إغلاق بجرد النقد،
-- المتوقّع مقابل المعلن (عجز/زيادة)، وتقرير Z مفصّل.
-- ============================================================

create table if not exists exhibitions.cashier_shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references exhibitions.tenants(id) on delete cascade,
  opened_by uuid references exhibitions.profiles(id) on delete set null,
  opened_at timestamptz not null default now(),
  opening_float numeric(14,2) not null default 0,
  closed_by uuid references exhibitions.profiles(id) on delete set null,
  closed_at timestamptz,
  declared_cash numeric(14,2),
  status text not null default 'open' check (status in ('open','closed')),
  note text
);

drop trigger if exists trg_set_tenant on exhibitions.cashier_shifts;
create trigger trg_set_tenant before insert on exhibitions.cashier_shifts
  for each row execute function exhibitions._set_tenant();
create index if not exists idx_shifts_tenant on exhibitions.cashier_shifts(tenant_id);
create unique index if not exists uq_open_shift_per_tenant on exhibitions.cashier_shifts(tenant_id) where status='open';
alter table exhibitions.cashier_shifts enable row level security;
drop policy if exists admin_all on exhibitions.cashier_shifts;
create policy admin_all on exhibitions.cashier_shifts for all to authenticated
  using (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id())
  with check (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id());
drop policy if exists mgr_rest on exhibitions.cashier_shifts;
create policy mgr_rest on exhibitions.cashier_shifts for all to authenticated
  using (exhibitions._im_can('can_manage_restaurant') and tenant_id=exhibitions.current_tenant_id())
  with check (exhibitions._im_can('can_manage_restaurant') and tenant_id=exhibitions.current_tenant_id());
grant select,insert,update,delete on exhibitions.cashier_shifts to authenticated;
grant all on exhibitions.cashier_shifts to service_role;

alter table exhibitions.table_sessions
  add column if not exists shift_id uuid references exhibitions.cashier_shifts(id) on delete set null;
create index if not exists idx_sessions_shift on exhibitions.table_sessions(shift_id);

create or replace function exhibitions._shift_z(p_shift_id uuid, p_tenant uuid)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
declare sh exhibitions.cashier_shifts; v_agg record; v_expected numeric;
begin
  select * into sh from exhibitions.cashier_shifts where id=p_shift_id and tenant_id=p_tenant;
  if not found then raise exception 'الوردية غير موجودة'; end if;
  select
    count(*) as bills,
    coalesce(sum(total_sar+coalesce(delivery_fee,0)),0) as sales,
    coalesce(sum(case when payment_method='cash' then total_sar+coalesce(delivery_fee,0) else 0 end),0) as cash_sales,
    coalesce(sum(case when payment_method='card' then total_sar+coalesce(delivery_fee,0) else 0 end),0) as card_sales,
    coalesce(sum(case when order_type='dine_in' then total_sar+coalesce(delivery_fee,0) else 0 end),0) as dine_in,
    coalesce(sum(case when order_type='takeaway' then total_sar+coalesce(delivery_fee,0) else 0 end),0) as takeaway,
    coalesce(sum(case when order_type='delivery' then total_sar+coalesce(delivery_fee,0) else 0 end),0) as delivery,
    coalesce(sum(coalesce(delivery_fee,0)),0) as delivery_fees
  into v_agg
  from exhibitions.table_sessions
  where shift_id=p_shift_id and tenant_id=p_tenant and status='paid';
  v_expected := coalesce(sh.opening_float,0) + v_agg.cash_sales;
  return json_build_object(
    'id',sh.id,'status',sh.status,'opened_at',sh.opened_at,'closed_at',sh.closed_at,
    'opening_float',sh.opening_float,
    'opened_by',(select full_name from exhibitions.profiles where id=sh.opened_by),
    'closed_by',(select full_name from exhibitions.profiles where id=sh.closed_by),
    'bills',v_agg.bills,'sales',v_agg.sales,'cash_sales',v_agg.cash_sales,'card_sales',v_agg.card_sales,
    'dine_in',v_agg.dine_in,'takeaway',v_agg.takeaway,'delivery',v_agg.delivery,'delivery_fees',v_agg.delivery_fees,
    'expected_cash',v_expected,'declared_cash',sh.declared_cash,
    'variance',case when sh.declared_cash is null then null else sh.declared_cash - v_expected end,
    'note',sh.note);
end $function$;

create or replace function exhibitions.shift_open(p_opening_float numeric default 0, p_token uuid default null)
returns json language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_tenant uuid; v_id uuid;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if p_token is not null then perform exhibitions._emp_require(v_actor,'can_waiter'); end if;
  if exists(select 1 from exhibitions.cashier_shifts where tenant_id=v_tenant and status='open') then
    raise exception 'يوجد وردية مفتوحة بالفعل'; end if;
  insert into exhibitions.cashier_shifts(tenant_id,opened_by,opening_float,status)
    values(v_tenant,v_actor,greatest(coalesce(p_opening_float,0),0),'open') returning id into v_id;
  return exhibitions._shift_z(v_id, v_tenant);
end $function$;

create or replace function exhibitions.shift_current(p_token uuid default null)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_tenant uuid; v_id uuid;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  select id into v_id from exhibitions.cashier_shifts where tenant_id=v_tenant and status='open' limit 1;
  if v_id is null then return null; end if;
  return exhibitions._shift_z(v_id, v_tenant);
end $function$;

create or replace function exhibitions.shift_close(p_declared_cash numeric, p_note text default null, p_token uuid default null)
returns json language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_tenant uuid; v_id uuid;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if p_token is not null then perform exhibitions._emp_require(v_actor,'can_waiter'); end if;
  select id into v_id from exhibitions.cashier_shifts where tenant_id=v_tenant and status='open' limit 1;
  if v_id is null then raise exception 'لا توجد وردية مفتوحة'; end if;
  update exhibitions.cashier_shifts set
    status='closed', closed_by=v_actor, closed_at=now(),
    declared_cash=greatest(coalesce(p_declared_cash,0),0), note=nullif(p_note,'')
   where id=v_id;
  return exhibitions._shift_z(v_id, v_tenant);
end $function$;

create or replace function exhibitions.shift_z(p_shift_id uuid, p_token uuid default null)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_tenant uuid;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  return exhibitions._shift_z(p_shift_id, v_tenant);
end $function$;

create or replace function exhibitions.close_table_bill(p_session_id uuid, p_payment_method text default 'cash', p_token uuid default null)
returns json language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_tenant uuid; v_table uuid; v_total numeric; v_cash text; v_pm exhibitions.payment_method;
        v_cogs numeric := 0; rec record; v_lines jsonb; v_fee numeric; v_charged numeric; v_shift uuid;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if p_token is not null then perform exhibitions._emp_require(v_actor,'can_waiter'); end if;
  select table_id, coalesce(delivery_fee,0) into v_table, v_fee from exhibitions.table_sessions
    where id=p_session_id and tenant_id=v_tenant and status in ('open','billing');
  if not found then raise exception 'الجلسة غير موجودة أو مقفلة مسبقًا'; end if;
  v_pm := coalesce(nullif(p_payment_method,''),'cash')::exhibitions.payment_method;
  select id into v_shift from exhibitions.cashier_shifts where tenant_id=v_tenant and status='open' limit 1;
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
    set status='paid', total_sar=v_total, payment_method=v_pm, closed_by=v_actor, closed_at=now(), shift_id=v_shift
    where id=p_session_id;
  update exhibitions.orders set status='served'
    where session_id=p_session_id and tenant_id=v_tenant and status in ('new','preparing','ready');
  if v_table is not null then
    update exhibitions.dining_tables set status='free' where id=v_table and tenant_id=v_tenant;
  end if;
  return json_build_object('session_id',p_session_id,'total',v_total,'delivery_fee',v_fee,'charged',v_charged,'cogs',v_cogs,'payment_method',v_pm);
end $function$;

grant execute on function exhibitions.shift_open(numeric,uuid) to authenticated;
grant execute on function exhibitions.shift_current(uuid) to authenticated;
grant execute on function exhibitions.shift_close(numeric,text,uuid) to authenticated;
grant execute on function exhibitions.shift_z(uuid,uuid) to authenticated;
