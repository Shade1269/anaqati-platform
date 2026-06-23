-- ============================================================
-- نظام المعارض — مراقبة الموظفين + الموردون + مطابقة الإغلاق | Migration 008
-- ============================================================

-- ---------- مدفوعات الموردين ----------
create table if not exists exhibitions.supplier_payments (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references exhibitions.suppliers(id) on delete restrict,
  amount_sar  numeric(14,2) not null check (amount_sar > 0),
  method      exhibitions.payment_method not null default 'cash',
  notes       text,
  created_by  uuid references exhibitions.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table exhibitions.supplier_payments enable row level security;
drop policy if exists admin_all on exhibitions.supplier_payments;
create policy admin_all on exhibitions.supplier_payments for all to authenticated
  using (exhibitions.is_admin()) with check (exhibitions.is_admin());
grant all on exhibitions.supplier_payments to service_role;
grant select on exhibitions.supplier_payments to authenticated;

create or replace function exhibitions.pay_supplier(p_supplier_id uuid, p_amount numeric, p_method text default 'cash', p_notes text default null)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_id uuid; v_cash text;
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  insert into exhibitions.supplier_payments(supplier_id,amount_sar,method,notes,created_by)
    values(p_supplier_id,p_amount,p_method::exhibitions.payment_method,p_notes,exhibitions.current_profile_id())
    returning id into v_id;
  v_cash := case when p_method='card' then '1020' else '1010' end;
  perform exhibitions._post(current_date,'سداد مورد','supplier_payments',v_id,
    jsonb_build_array(jsonb_build_object('account','2010','debit',p_amount,'credit',0),
      jsonb_build_object('account',v_cash,'debit',0,'credit',p_amount)));
  return v_id;
end $$;

create or replace function exhibitions.supplier_balances()
returns json language sql stable security definer set search_path=exhibitions,public as $$
  select coalesce(json_agg(row_to_json(s) order by s.name),'[]') from (
    select sup.id, sup.name, sup.phone,
      coalesce((select sum(ri.qty*pr.cost_price_sar)
         from exhibitions.stock_receipts r
         join exhibitions.stock_receipt_items ri on ri.receipt_id=r.id
         join exhibitions.products pr on pr.id=ri.product_id
        where r.supplier_id=sup.id),0) as purchased,
      coalesce((select sum(amount_sar) from exhibitions.supplier_payments sp where sp.supplier_id=sup.id),0) as paid,
      coalesce((select sum(ri.qty*pr.cost_price_sar) from exhibitions.stock_receipts r
         join exhibitions.stock_receipt_items ri on ri.receipt_id=r.id
         join exhibitions.products pr on pr.id=ri.product_id where r.supplier_id=sup.id),0)
       - coalesce((select sum(amount_sar) from exhibitions.supplier_payments sp where sp.supplier_id=sup.id),0) as balance
    from exhibitions.suppliers sup
  ) s;
$$;

-- ---------- ملف الموظف (مراقبة شاملة) ----------
create or replace function exhibitions.employee_file(p_employee_id uuid)
returns json language sql stable security definer set search_path=exhibitions,public as $$
  with sales as (
    select coalesce(sum(si.qty*si.unit_sale_price_sar),0) total, count(distinct sa.id) cnt
    from exhibitions.sales sa join exhibitions.sale_items si on si.sale_id=sa.id
    where sa.employee_id=p_employee_id),
  ret as (select coalesce(sum(refund_amount_sar),0) total from exhibitions.sale_returns where employee_id=p_employee_id),
  settled as (select coalesce(sum(admin_confirmed_amount_sar),0) cash, coalesce(sum(greatest(shortage_sar,0)),0) shortage
    from exhibitions.consignment_settlements where employee_id=p_employee_id and status='accepted'),
  adv as (select coalesce(sum(amount_sar),0) total from exhibitions.salary_advances where employee_id=p_employee_id),
  comm as (select coalesce(sum(commission_sar),0) total from exhibitions.commissions where beneficiary_id=p_employee_id and status<>'cancelled'),
  att as (select count(*) present from exhibitions.attendance where employee_id=p_employee_id and status='present' and work_date >= date_trunc('month',current_date)),
  goods as (select coalesce(sum(i.quantity),0) qty, coalesce(sum(i.quantity*pr.sale_price_ref),0) retail
    from exhibitions.inventory i join exhibitions.products pr on pr.id=i.product_id
    where i.location_type='employee_consignment' and i.location_id=p_employee_id and i.quantity>0)
  select json_build_object(
    'profile',(select row_to_json(x) from (select pr.id,pr.full_name,pr.phone,pr.status,
        ed.monthly_salary_sar, ed.access_code, ed.is_active, ed.hire_date
       from exhibitions.profiles pr left join exhibitions.employee_details ed on ed.profile_id=pr.id
       where pr.id=p_employee_id) x),
    'sales_total',(select total from sales),'sales_count',(select cnt from sales),
    'returns_total',(select total from ret),
    'cash_due',(select (select total from sales)-(select total from ret)-(select cash from settled)-(select shortage from settled)),
    'cash_settled',(select cash from settled),'shortages_total',(select shortage from settled),
    'consignment_qty',(select qty from goods),'consignment_retail',(select retail from goods),
    'advances_total',(select total from adv),'commissions_total',(select total from comm),
    'present_days_month',(select present from att));
$$;

-- ---------- كشف مطابقة عُهدة الموظف (بضاعة + كاش) ----------
create or replace function exhibitions.employee_consignment_report(p_employee_id uuid)
returns json language sql stable security definer set search_path=exhibitions,public as $$
  with prod as (
    select distinct product_id from (
      select product_id from exhibitions.consignment_withdrawals where employee_id=p_employee_id
      union
      select i.product_id from exhibitions.inventory i where i.location_type='employee_consignment' and i.location_id=p_employee_id and i.quantity<>0
    ) z),
  rows as (
    select pr.id as product_id, p.name, p.product_code,
      coalesce((select sum(qty) from exhibitions.consignment_withdrawals w where w.employee_id=p_employee_id and w.product_id=pr.id),0) as withdrawn,
      coalesce((select sum(si.qty) from exhibitions.sales sa join exhibitions.sale_items si on si.sale_id=sa.id
                 where sa.employee_id=p_employee_id and si.product_id=pr.id),0) as sold,
      coalesce((select sum(sri.qty) from exhibitions.sale_returns sr
                 join exhibitions.sale_return_items sri on sri.return_id=sr.id
                 join exhibitions.sale_items si2 on si2.id=sri.sale_item_id
                 where sr.employee_id=p_employee_id and si2.product_id=pr.id),0) as returned,
      coalesce((select quantity from exhibitions.inventory i
                 where i.location_type='employee_consignment' and i.location_id=p_employee_id and i.product_id=pr.id),0) as on_hand
    from prod pr join exhibitions.products p on p.id=pr.product_id)
  select json_build_object(
    'goods',(select coalesce(json_agg(json_build_object(
        'product_id',product_id,'name',name,'code',product_code,
        'withdrawn',withdrawn,'sold',sold,'returned',returned,'on_hand',on_hand,
        'variance', withdrawn - sold + returned - on_hand) order by name),'[]') from rows),
    'cash',(select row_to_json(c) from (
       select
         coalesce((select sum(si.qty*si.unit_sale_price_sar) from exhibitions.sales sa join exhibitions.sale_items si on si.sale_id=sa.id where sa.employee_id=p_employee_id),0) as sales,
         coalesce((select sum(refund_amount_sar) from exhibitions.sale_returns where employee_id=p_employee_id),0) as returns,
         coalesce((select sum(admin_confirmed_amount_sar) from exhibitions.consignment_settlements where employee_id=p_employee_id and status='accepted'),0) as settled,
         coalesce((select sum(greatest(shortage_sar,0)) from exhibitions.consignment_settlements where employee_id=p_employee_id and status='accepted'),0) as shortage
     ) c));
$$;
-- variance>0 في البضاعة = نقص (فاقد/غير مُبلّغ) | cash: due = sales - returns - settled - shortage

-- ---------- مطابقة وإغلاق المعرض (تأكيد العدد + الفاقد) ----------
create or replace function exhibitions.branch_close_preview(p_branch_id uuid)
returns json language sql stable security definer set search_path=exhibitions,public as $$
  select coalesce(json_agg(json_build_object(
     'product_id',i.product_id,'name',p.name,'code',p.product_code,'expected',i.quantity) order by p.name),'[]')
  from exhibitions.inventory i join exhibitions.products p on p.id=i.product_id
  where i.location_type='branch' and i.location_id=p_branch_id and i.quantity>0;
$$;

create or replace function exhibitions.reconcile_and_close_branch(p_branch_id uuid, p_counts jsonb default '[]')
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_actor uuid; v_wh uuid; v_transfer uuid; rec record; v_recv int; v_loss int; v_cost numeric; v_total_loss numeric:=0;
begin
  if not exhibitions.is_admin() and not exhibitions._im_can('can_receive_returns') then raise exception 'غير مصرّح'; end if;
  v_actor := exhibitions.current_profile_id();
  select source_warehouse_id into v_wh from exhibitions.branches where id=p_branch_id;
  insert into exhibitions.stock_transfers(type,from_location_type,from_location_id,to_location_type,to_location_id,issued_by,status)
    values('return','branch',p_branch_id,'warehouse',coalesce(v_wh,p_branch_id),v_actor,'completed') returning id into v_transfer;
  drop table if exists _bclose;
  create temporary table _bclose on commit drop as
    select product_id, quantity from exhibitions.inventory
    where location_type='branch' and location_id=p_branch_id and quantity>0;
  for rec in select * from _bclose loop
    select (c->>'received')::int into v_recv from jsonb_array_elements(p_counts) c
      where (c->>'product_id')::uuid = rec.product_id limit 1;
    if v_recv is null then v_recv := rec.quantity; end if;
    if v_recv > rec.quantity then v_recv := rec.quantity; end if;
    if v_recv < 0 then v_recv := 0; end if;
    v_loss := rec.quantity - v_recv;
    if v_wh is not null and v_recv>0 then
      insert into exhibitions.stock_transfer_items(transfer_id,product_id,qty) values(v_transfer,rec.product_id,v_recv);
      perform exhibitions._move_stock(rec.product_id,v_recv,'branch',p_branch_id,'warehouse',v_wh,'transfer_return','stock_transfers',v_transfer,v_actor);
    end if;
    if v_loss>0 then
      perform exhibitions._move_stock(rec.product_id,v_loss,'branch',p_branch_id,null,null,'adjustment','stock_transfers',v_transfer,v_actor);
      select cost_price_sar into v_cost from exhibitions.products where id=rec.product_id;
      v_total_loss := v_total_loss + v_loss*coalesce(v_cost,0);
    end if;
  end loop;
  if v_total_loss>0 then
    perform exhibitions._post(current_date,'فاقد إغلاق معرض','stock_transfers',v_transfer,
      jsonb_build_array(jsonb_build_object('account','5400','debit',v_total_loss,'credit',0),
        jsonb_build_object('account','1100','debit',0,'credit',v_total_loss)));
  end if;
  update exhibitions.branches set status='closed' where id=p_branch_id;
  perform exhibitions._audit('branch_reconciled_closed','branches',p_branch_id,null,jsonb_build_object('loss_value',v_total_loss));
  return json_build_object('transfer_id',v_transfer,'loss_value',v_total_loss);
end $$;

grant execute on function exhibitions.pay_supplier(uuid,numeric,text,text) to authenticated;
grant execute on function exhibitions.supplier_balances() to authenticated;
grant execute on function exhibitions.employee_file(uuid) to authenticated;
grant execute on function exhibitions.employee_consignment_report(uuid) to authenticated;
grant execute on function exhibitions.branch_close_preview(uuid) to authenticated;
grant execute on function exhibitions.reconcile_and_close_branch(uuid,jsonb) to authenticated;
