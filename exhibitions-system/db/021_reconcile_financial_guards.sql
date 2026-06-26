-- ============================================================
-- مصالحة المستودع مع القاعدة الحيّة | Migration 021
-- ملاحظة مهمة: إصلاحات أمنية مبكّرة طُبّقت على القاعدة الحيّة (atlantis)
-- لكنها لم تُكتب في ملفات db/ القديمة (006/002/008/009). هذه الهجرة
-- تثبّت النسخ الآمنة في المستودع ليصبح إعادة النشر من الصفر آمنة.
-- كل دوال التقارير المالية/المراقبة محميّة بـ is_admin() ومفلترة بـ
-- tenant_id = current_tenant_id() (لا تسريب بين المشتركين).
-- (CREATE OR REPLACE — لا أثر على القاعدة الحيّة لأنها مطابقة بالفعل.)
-- ============================================================

create or replace function exhibitions.trial_balance(p_from date default null, p_to date default null)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  return (select coalesce(json_agg(row_to_json(t) order by t.sort),'[]') from (
    select a.code,a.name,a.type,a.sort, coalesce(sum(l.debit),0) as debit, coalesce(sum(l.credit),0) as credit,
      coalesce(sum(l.debit),0)-coalesce(sum(l.credit),0) as balance
    from exhibitions.accounts a
    left join exhibitions.journal_lines l on l.account_code=a.code and l.tenant_id=exhibitions.current_tenant_id()
    left join exhibitions.journal_entries e on e.id=l.entry_id and (p_from is null or e.entry_date>=p_from) and (p_to is null or e.entry_date<=p_to)
    group by a.code,a.name,a.type,a.sort
    having coalesce(sum(l.debit),0)<>0 or coalesce(sum(l.credit),0)<>0) t);
end $function$;

create or replace function exhibitions.income_statement(p_from date default null, p_to date default null)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  return (with l as (select a.code,a.name,a.type, coalesce(sum(jl.credit-jl.debit),0) as net
      from exhibitions.accounts a
      left join exhibitions.journal_lines jl on jl.account_code=a.code and jl.tenant_id=exhibitions.current_tenant_id()
      left join exhibitions.journal_entries e on e.id=jl.entry_id and (p_from is null or e.entry_date>=p_from) and (p_to is null or e.entry_date<=p_to)
      where a.type in ('revenue','expense') group by a.code,a.name,a.type)
    select json_build_object('revenue',(select coalesce(sum(net),0) from l where type='revenue'),
      'expenses',(select coalesce(-sum(net),0) from l where type='expense'),
      'net_profit',(select coalesce(sum(net),0) from l),
      'lines',(select coalesce(json_agg(json_build_object('code',code,'name',name,'type',type,'amount',case when type='revenue' then net else -net end)),'[]') from l)));
end $function$;

create or replace function exhibitions.balance_sheet(p_as_of date default null)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  return (with l as (select a.code,a.name,a.type,
      coalesce(sum(jl.debit),0)-coalesce(sum(jl.credit),0) as dr_balance,
      coalesce(sum(jl.credit),0)-coalesce(sum(jl.debit),0) as cr_balance
      from exhibitions.accounts a
      left join exhibitions.journal_lines jl on jl.account_code=a.code and jl.tenant_id=exhibitions.current_tenant_id()
      left join exhibitions.journal_entries e on e.id=jl.entry_id and (p_as_of is null or e.entry_date<=p_as_of)
      group by a.code,a.name,a.type)
    select json_build_object(
      'assets',(select coalesce(json_agg(json_build_object('code',code,'name',name,'balance',dr_balance)),'[]') from l where type='asset' and dr_balance<>0),
      'total_assets',(select coalesce(sum(dr_balance),0) from l where type='asset'),
      'liabilities',(select coalesce(json_agg(json_build_object('code',code,'name',name,'balance',cr_balance)),'[]') from l where type='liability' and cr_balance<>0),
      'total_liabilities',(select coalesce(sum(cr_balance),0) from l where type='liability'),
      'equity',(select coalesce(json_agg(json_build_object('code',code,'name',name,'balance',cr_balance)),'[]') from l where type='equity' and cr_balance<>0),
      'total_equity',(select coalesce(sum(cr_balance),0) from l where type='equity'),
      'net_income',(select coalesce(sum(cr_balance),0) from l where type in ('revenue','expense'))));
end $function$;

create or replace function exhibitions.account_ledger(p_code text, p_from date default null, p_to date default null)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  return (select coalesce(json_agg(json_build_object('date',e.entry_date,'memo',e.memo,'debit',jl.debit,'credit',jl.credit,'source',e.source_table) order by e.entry_date, e.created_at),'[]')
    from exhibitions.journal_lines jl join exhibitions.journal_entries e on e.id=jl.entry_id
    where jl.account_code=p_code and jl.tenant_id=exhibitions.current_tenant_id()
      and (p_from is null or e.entry_date>=p_from) and (p_to is null or e.entry_date<=p_to));
end $function$;

create or replace function exhibitions.financial_summary()
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  return (with b as (select a.code, coalesce(sum(jl.debit-jl.credit),0) as bal
      from exhibitions.accounts a left join exhibitions.journal_lines jl on jl.account_code=a.code and jl.tenant_id=exhibitions.current_tenant_id()
      group by a.code)
    select json_build_object('cash',(select coalesce(bal,0) from b where code='1010'),
      'card',(select coalesce(bal,0) from b where code='1020'),
      'inventory_value',(select coalesce(bal,0) from b where code='1100'),
      'employee_receivable',(select coalesce(bal,0) from b where code='1200'),
      'suppliers_payable',(select coalesce(-bal,0) from b where code='2010'),
      'commissions_payable',(select coalesce(-bal,0) from b where code='2200')));
end $function$;

create or replace function exhibitions.cash_flow(p_from date default null, p_to date default null)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  return (with cash_entries as (
      select e.id, coalesce(nullif(e.memo,''),'أخرى') as category, sum(jl.debit-jl.credit) as cash_delta
      from exhibitions.journal_lines jl join exhibitions.journal_entries e on e.id=jl.entry_id
      where jl.account_code in ('1010','1020') and jl.tenant_id=exhibitions.current_tenant_id()
        and (p_from is null or e.entry_date>=p_from) and (p_to is null or e.entry_date<=p_to)
      group by e.id, e.memo),
    agg as (select category, sum(case when cash_delta>0 then cash_delta else 0 end) inflow,
        sum(case when cash_delta<0 then -cash_delta else 0 end) outflow from cash_entries group by category)
    select json_build_object(
      'inflows',(select coalesce(json_agg(json_build_object('category',category,'amount',inflow) order by inflow desc),'[]') from agg where inflow>0),
      'outflows',(select coalesce(json_agg(json_build_object('category',category,'amount',outflow) order by outflow desc),'[]') from agg where outflow>0),
      'net_change',(select coalesce(sum(cash_delta),0) from cash_entries),
      'total_in',(select coalesce(sum(inflow),0) from agg),'total_out',(select coalesce(sum(outflow),0) from agg)));
end $function$;

create or replace function exhibitions.branch_pnl(p_branch_id uuid)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  return (with s as (select coalesce(sum(si.qty*si.unit_sale_price_sar),0) sales, coalesce(sum(si.qty*si.unit_cost_snapshot_sar),0) cost
      from exhibitions.sales sa join exhibitions.sale_items si on si.sale_id=sa.id
      where sa.branch_id=p_branch_id and sa.status='completed' and sa.tenant_id=exhibitions.current_tenant_id()),
    r as (select coalesce(sum(refund_amount_sar),0) refunds from exhibitions.sale_returns where branch_id=p_branch_id and tenant_id=exhibitions.current_tenant_id()),
    e as (select coalesce(sum(amount_sar),0) expenses from exhibitions.expenses where branch_id=p_branch_id and tenant_id=exhibitions.current_tenant_id()),
    c as (select coalesce(sum(commission_sar),0) commissions from exhibitions.commissions where branch_id=p_branch_id and status<>'cancelled' and tenant_id=exhibitions.current_tenant_id())
    select json_build_object('branch_id',p_branch_id,'net_sales',(s.sales-r.refunds),'cost',s.cost,'expenses',e.expenses,'commissions',c.commissions,
      'net_profit',(s.sales-r.refunds)-s.cost-e.expenses-c.commissions) from s,r,e,c);
end $function$;

create or replace function exhibitions.supplier_balances()
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  return (select coalesce(json_agg(row_to_json(s) order by s.name),'[]') from (
    select sup.id, sup.name, sup.phone,
      coalesce((select sum(ri.qty*pr.cost_price_sar) from exhibitions.stock_receipts r join exhibitions.stock_receipt_items ri on ri.receipt_id=r.id join exhibitions.products pr on pr.id=ri.product_id where r.supplier_id=sup.id),0) as purchased,
      coalesce((select sum(amount_sar) from exhibitions.supplier_payments sp where sp.supplier_id=sup.id),0) as paid,
      coalesce((select sum(ri.qty*pr.cost_price_sar) from exhibitions.stock_receipts r join exhibitions.stock_receipt_items ri on ri.receipt_id=r.id join exhibitions.products pr on pr.id=ri.product_id where r.supplier_id=sup.id),0)
       - coalesce((select sum(amount_sar) from exhibitions.supplier_payments sp where sp.supplier_id=sup.id),0) as balance
    from exhibitions.suppliers sup where sup.tenant_id=exhibitions.current_tenant_id()) s);
end $function$;

create or replace function exhibitions.employee_file(p_employee_id uuid)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
declare v_t uuid := exhibitions.current_tenant_id();
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  if not exists(select 1 from exhibitions.profiles where id=p_employee_id and tenant_id=v_t) then raise exception 'الموظف غير موجود'; end if;
  return (with sales as (select coalesce(sum(si.qty*si.unit_sale_price_sar),0) total, count(distinct sa.id) cnt
      from exhibitions.sales sa join exhibitions.sale_items si on si.sale_id=sa.id where sa.employee_id=p_employee_id),
    ret as (select coalesce(sum(refund_amount_sar),0) total from exhibitions.sale_returns where employee_id=p_employee_id),
    settled as (select coalesce(sum(admin_confirmed_amount_sar),0) cash, coalesce(sum(greatest(shortage_sar,0)),0) shortage from exhibitions.consignment_settlements where employee_id=p_employee_id and status='accepted'),
    adv as (select coalesce(sum(amount_sar),0) total from exhibitions.salary_advances where employee_id=p_employee_id),
    comm as (select coalesce(sum(commission_sar),0) total from exhibitions.commissions where beneficiary_id=p_employee_id and status<>'cancelled'),
    att as (select count(*) present from exhibitions.attendance where employee_id=p_employee_id and status='present' and work_date>=date_trunc('month',current_date)),
    goods as (select coalesce(sum(i.quantity),0) qty, coalesce(sum(i.quantity*pr.sale_price_ref),0) retail from exhibitions.inventory i join exhibitions.products pr on pr.id=i.product_id where i.location_type='employee_consignment' and i.location_id=p_employee_id and i.quantity>0)
    select json_build_object(
      'profile',(select row_to_json(x) from (select pr.id,pr.full_name,pr.phone,pr.status,ed.monthly_salary_sar,ed.access_code,ed.is_active,ed.hire_date from exhibitions.profiles pr left join exhibitions.employee_details ed on ed.profile_id=pr.id where pr.id=p_employee_id) x),
      'sales_total',(select total from sales),'sales_count',(select cnt from sales),'returns_total',(select total from ret),
      'cash_due',(select (select total from sales)-(select total from ret)-(select cash from settled)-(select shortage from settled)),
      'cash_settled',(select cash from settled),'shortages_total',(select shortage from settled),
      'consignment_qty',(select qty from goods),'consignment_retail',(select retail from goods),
      'advances_total',(select total from adv),'commissions_total',(select total from comm),'present_days_month',(select present from att)));
end $function$;

create or replace function exhibitions.employee_consignment_report(p_employee_id uuid)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
declare v_t uuid := exhibitions.current_tenant_id();
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  if not exists(select 1 from exhibitions.profiles where id=p_employee_id and tenant_id=v_t) then raise exception 'الموظف غير موجود'; end if;
  return (with prod as (select distinct product_id from (
        select product_id from exhibitions.consignment_withdrawals where employee_id=p_employee_id
        union select i.product_id from exhibitions.inventory i where i.location_type='employee_consignment' and i.location_id=p_employee_id and i.quantity<>0) z),
    rows as (select pr.product_id, p.name, p.product_code,
        coalesce((select sum(qty) from exhibitions.consignment_withdrawals w where w.employee_id=p_employee_id and w.product_id=pr.product_id),0) as withdrawn,
        coalesce((select sum(si.qty) from exhibitions.sales sa join exhibitions.sale_items si on si.sale_id=sa.id where sa.employee_id=p_employee_id and si.product_id=pr.product_id),0) as sold,
        coalesce((select sum(sri.qty) from exhibitions.sale_returns sr join exhibitions.sale_return_items sri on sri.return_id=sr.id join exhibitions.sale_items si2 on si2.id=sri.sale_item_id where sr.employee_id=p_employee_id and si2.product_id=pr.product_id),0) as returned,
        coalesce((select quantity from exhibitions.inventory i where i.location_type='employee_consignment' and i.location_id=p_employee_id and i.product_id=pr.product_id),0) as on_hand
      from prod pr join exhibitions.products p on p.id=pr.product_id)
    select json_build_object(
      'goods',(select coalesce(json_agg(json_build_object('product_id',product_id,'name',name,'code',product_code,'withdrawn',withdrawn,'sold',sold,'returned',returned,'on_hand',on_hand,'variance',withdrawn-sold+returned-on_hand) order by name),'[]') from rows),
      'cash',(select row_to_json(c) from (select
         coalesce((select sum(si.qty*si.unit_sale_price_sar) from exhibitions.sales sa join exhibitions.sale_items si on si.sale_id=sa.id where sa.employee_id=p_employee_id),0) as sales,
         coalesce((select sum(refund_amount_sar) from exhibitions.sale_returns where employee_id=p_employee_id),0) as returns,
         coalesce((select sum(admin_confirmed_amount_sar) from exhibitions.consignment_settlements where employee_id=p_employee_id and status='accepted'),0) as settled,
         coalesce((select sum(greatest(shortage_sar,0)) from exhibitions.consignment_settlements where employee_id=p_employee_id and status='accepted'),0) as shortage) c)));
end $function$;
