-- ============================================================
-- نظام إدارة المعارض — محرّك المخزون + الـ RPCs + الأدوار + المالية
-- Migration 002 | schema: exhibitions | project: atlantis
-- ============================================================

-- ---------- Role / permission helpers ----------
create or replace function exhibitions.is_inventory_manager()
returns boolean language sql stable security definer set search_path=exhibitions,public as $$
  select exists(select 1 from exhibitions.profiles
    where auth_user_id=auth.uid() and role='inventory_manager' and status='active');
$$;

create or replace function exhibitions._im_can(p_perm text)
returns boolean language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v boolean;
begin
  if exhibitions.is_admin() then return true; end if;
  if not exhibitions.is_inventory_manager() then return false; end if;
  execute format(
    'select coalesce(%I,false) from exhibitions.im_permissions p
       join exhibitions.profiles pr on pr.id=p.profile_id
      where pr.auth_user_id=auth.uid()', p_perm) into v;
  return coalesce(v,false);
end $$;

-- ---------- Inventory engine (single source of truth) ----------
create or replace function exhibitions._move_stock(
  p_product_id uuid, p_qty integer,
  p_from_type exhibitions.location_type, p_from_id uuid,
  p_to_type exhibitions.location_type, p_to_id uuid,
  p_movement exhibitions.movement_type,
  p_ref_table text, p_ref_id uuid, p_actor uuid)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_avail integer;
begin
  if p_qty <= 0 then raise exception 'الكمية لازم تكون أكبر من صفر'; end if;

  if p_from_type is not null then
    select quantity into v_avail from exhibitions.inventory
      where product_id=p_product_id and location_type=p_from_type and location_id=p_from_id for update;
    v_avail := coalesce(v_avail,0);
    if p_movement <> 'adjustment' and v_avail < p_qty then
      raise exception 'الكمية غير كافية (متاح %، مطلوب %)', v_avail, p_qty;
    end if;
    insert into exhibitions.inventory(product_id,location_type,location_id,quantity)
      values(p_product_id,p_from_type,p_from_id,-p_qty)
      on conflict (product_id,location_type,location_id)
      do update set quantity = exhibitions.inventory.quantity - p_qty, updated_at=now();
  end if;

  if p_to_type is not null then
    insert into exhibitions.inventory(product_id,location_type,location_id,quantity)
      values(p_product_id,p_to_type,p_to_id,p_qty)
      on conflict (product_id,location_type,location_id)
      do update set quantity = exhibitions.inventory.quantity + p_qty, updated_at=now();
  end if;

  insert into exhibitions.stock_movements(product_id,movement_type,qty,
      from_location_type,from_location_id,to_location_type,to_location_id,ref_table,ref_id,created_by)
    values(p_product_id,p_movement,p_qty,p_from_type,p_from_id,p_to_type,p_to_id,p_ref_table,p_ref_id,p_actor);
end $$;

-- ============================================================
-- Employee auth (phone + access code → session token)
-- ============================================================
create table if not exists exhibitions.employee_sessions (
  token       uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references exhibitions.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days'
);
alter table exhibitions.employee_sessions enable row level security;
drop policy if exists admin_all on exhibitions.employee_sessions;
create policy admin_all on exhibitions.employee_sessions for all to authenticated
  using (exhibitions.is_admin()) with check (exhibitions.is_admin());

create or replace function exhibitions.employee_login(p_phone text, p_access_code text)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_profile exhibitions.profiles; v_token uuid;
begin
  select pr.* into v_profile from exhibitions.profiles pr
    join exhibitions.employee_details ed on ed.profile_id=pr.id
   where pr.phone=p_phone and ed.access_code=p_access_code
     and pr.role='employee' and pr.status='active' and ed.is_active=true;
  if not found then raise exception 'بيانات الدخول غير صحيحة'; end if;
  insert into exhibitions.employee_sessions(profile_id) values(v_profile.id) returning token into v_token;
  return json_build_object('token',v_token,'profile_id',v_profile.id,'full_name',v_profile.full_name);
end $$;

create or replace function exhibitions._employee_from_token(p_token uuid)
returns uuid language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v uuid;
begin
  select profile_id into v from exhibitions.employee_sessions where token=p_token and expires_at>now();
  if v is null then raise exception 'الجلسة منتهية أو غير صحيحة، سجّل الدخول من جديد'; end if;
  return v;
end $$;

-- ============================================================
-- Admin: employees & permissions
-- ============================================================
create or replace function exhibitions.create_employee(
  p_full_name text, p_phone text, p_monthly_salary numeric,
  p_access_code text default null, p_hire_date date default current_date)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_pid uuid; v_code text;
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  v_code := coalesce(nullif(p_access_code,''), lpad((floor(random()*1000000))::int::text,6,'0'));
  insert into exhibitions.profiles(full_name,phone,role,status)
    values(p_full_name,p_phone,'employee','active') returning id into v_pid;
  insert into exhibitions.employee_details(profile_id,access_code,monthly_salary_sar,hire_date)
    values(v_pid,v_code,coalesce(p_monthly_salary,0),p_hire_date);
  return json_build_object('profile_id',v_pid,'access_code',v_code);
end $$;

create or replace function exhibitions.set_im_permissions(
  p_profile_id uuid, p_add_stock boolean, p_approve boolean,
  p_transfers boolean, p_wholesale boolean, p_returns boolean)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  insert into exhibitions.im_permissions(profile_id,can_add_stock,can_approve_requests,can_issue_transfers,can_issue_wholesale,can_receive_returns,updated_at)
    values(p_profile_id,p_add_stock,p_approve,p_transfers,p_wholesale,p_returns,now())
  on conflict (profile_id) do update set
    can_add_stock=excluded.can_add_stock, can_approve_requests=excluded.can_approve_requests,
    can_issue_transfers=excluded.can_issue_transfers, can_issue_wholesale=excluded.can_issue_wholesale,
    can_receive_returns=excluded.can_receive_returns, updated_at=now();
end $$;

-- ============================================================
-- Procurement: receive stock into warehouse
-- ============================================================
create or replace function exhibitions.receive_stock(p_warehouse_id uuid, p_supplier_id uuid, p_items jsonb)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_receipt uuid; v_actor uuid; r jsonb;
begin
  if not exhibitions._im_can('can_add_stock') then raise exception 'غير مصرّح بإضافة مخزون'; end if;
  v_actor := exhibitions.current_profile_id();
  insert into exhibitions.stock_receipts(warehouse_id,supplier_id,received_by)
    values(p_warehouse_id,p_supplier_id,v_actor) returning id into v_receipt;
  for r in select * from jsonb_array_elements(p_items) loop
    insert into exhibitions.stock_receipt_items(receipt_id,product_id,qty)
      values(v_receipt,(r->>'product_id')::uuid,(r->>'qty')::int);
    perform exhibitions._move_stock((r->>'product_id')::uuid,(r->>'qty')::int,
      null,null,'warehouse',p_warehouse_id,'receipt','stock_receipts',v_receipt,v_actor);
  end loop;
  return v_receipt;
end $$;

-- ============================================================
-- Distribution: employee requests → IM reviews → transfer
-- ============================================================
create or replace function exhibitions.request_stock(p_token uuid, p_branch_id uuid, p_items jsonb)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_emp uuid; v_req uuid; r jsonb;
begin
  v_emp := exhibitions._employee_from_token(p_token);
  insert into exhibitions.stock_requests(branch_id,requested_by,status)
    values(p_branch_id,v_emp,'pending') returning id into v_req;
  for r in select * from jsonb_array_elements(p_items) loop
    insert into exhibitions.stock_request_items(request_id,product_id,qty_requested)
      values(v_req,(r->>'product_id')::uuid,(r->>'qty')::int);
  end loop;
  insert into exhibitions.notifications(recipient_id,type,title,body,ref_table,ref_id)
    select id,'stock_request','طلب معرض جديد','وصل طلب بضاعة جديد بانتظار المراجعة','stock_requests',v_req
      from exhibitions.profiles where role in ('inventory_manager','admin') and status='active';
  return v_req;
end $$;

create or replace function exhibitions.review_stock_request(
  p_request_id uuid, p_action text, p_approvals jsonb default '[]')
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_actor uuid; v_branch uuid; v_wh uuid; v_transfer uuid; r jsonb; v_qty int; v_any int:=0;
begin
  if not exhibitions._im_can('can_approve_requests') then raise exception 'غير مصرّح بمراجعة الطلبات'; end if;
  v_actor := exhibitions.current_profile_id();
  select branch_id into v_branch from exhibitions.stock_requests where id=p_request_id;
  if v_branch is null then raise exception 'الطلب غير موجود'; end if;

  if p_action='reject' then
    update exhibitions.stock_requests set status='rejected',reviewed_by=v_actor,reviewed_at=now() where id=p_request_id;
    insert into exhibitions.notifications(recipient_id,type,title,body,ref_table,ref_id)
      select requested_by,'request_rejected','تم رفض الطلب','تم رفض طلب البضاعة','stock_requests',id
        from exhibitions.stock_requests where id=p_request_id and requested_by is not null;
    return p_request_id;
  end if;

  select source_warehouse_id into v_wh from exhibitions.branches where id=v_branch;
  if v_wh is null then raise exception 'المعرض ما عنده مستودع مصدر محدّد'; end if;
  insert into exhibitions.stock_transfers(type,from_location_type,from_location_id,to_location_type,to_location_id,request_id,issued_by,status)
    values('issue','warehouse',v_wh,'branch',v_branch,p_request_id,v_actor,'completed') returning id into v_transfer;

  for r in select * from jsonb_array_elements(p_approvals) loop
    v_qty := (r->>'qty_approved')::int;
    update exhibitions.stock_request_items set qty_approved=v_qty
      where request_id=p_request_id and product_id=(r->>'product_id')::uuid;
    if v_qty>0 then
      insert into exhibitions.stock_transfer_items(transfer_id,product_id,qty)
        values(v_transfer,(r->>'product_id')::uuid,v_qty);
      perform exhibitions._move_stock((r->>'product_id')::uuid,v_qty,'warehouse',v_wh,'branch',v_branch,
        'transfer_issue','stock_transfers',v_transfer,v_actor);
      v_any := v_any+1;
    end if;
  end loop;

  update exhibitions.stock_requests set
    status = (case when v_any=0 then 'rejected'
      when exists(select 1 from exhibitions.stock_request_items
        where request_id=p_request_id and coalesce(qty_approved,0) < qty_requested) then 'partial'
      else 'fulfilled' end)::exhibitions.request_status,
    reviewed_by=v_actor, reviewed_at=now()
   where id=p_request_id;

  insert into exhibitions.notifications(recipient_id,type,title,body,ref_table,ref_id)
    select requested_by,'request_reviewed','تمت مراجعة طلبك','تمت الموافقة على طلب البضاعة','stock_requests',p_request_id
      from exhibitions.stock_requests where id=p_request_id and requested_by is not null;
  return v_transfer;
end $$;

-- ============================================================
-- Consignment: employee withdraws goods (branch → consignment)
-- ============================================================
create or replace function exhibitions.withdraw_consignment(p_token uuid, p_branch_id uuid, p_items jsonb)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_emp uuid; r jsonb; v_id uuid;
begin
  v_emp := exhibitions._employee_from_token(p_token);
  for r in select * from jsonb_array_elements(p_items) loop
    insert into exhibitions.consignment_withdrawals(employee_id,branch_id,product_id,qty)
      values(v_emp,p_branch_id,(r->>'product_id')::uuid,(r->>'qty')::int) returning id into v_id;
    perform exhibitions._move_stock((r->>'product_id')::uuid,(r->>'qty')::int,
      'branch',p_branch_id,'employee_consignment',v_emp,'consignment_out','consignment_withdrawals',v_id,v_emp);
  end loop;
end $$;

-- ============================================================
-- Sales (employee sets price; cost snapshot hidden)
-- ============================================================
create or replace function exhibitions.create_sale(
  p_token uuid, p_branch_id uuid, p_payment_method text, p_items jsonb)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_emp uuid; v_sale uuid; r jsonb; v_total numeric:=0; v_cost numeric; v_qty int; v_price numeric; v_pid uuid;
begin
  v_emp := exhibitions._employee_from_token(p_token);
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
end $$;

create or replace function exhibitions.create_sale_return(
  p_token uuid, p_sale_id uuid, p_items jsonb, p_refund_method text default null)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_emp uuid; v_branch uuid; v_ret uuid; r jsonb; v_refund numeric:=0; v_si exhibitions.sale_items; v_qty int;
begin
  v_emp := exhibitions._employee_from_token(p_token);
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
end $$;

-- ============================================================
-- Consignment settlement (cumulative; open submit time)
-- ============================================================
create or replace function exhibitions.submit_settlement(p_token uuid, p_declared_cash numeric, p_declared_card numeric)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_emp uuid; v_from date; v_id uuid;
begin
  v_emp := exhibitions._employee_from_token(p_token);
  select max(period_to) into v_from from exhibitions.consignment_settlements where employee_id=v_emp and status='accepted';
  insert into exhibitions.consignment_settlements(employee_id,period_from,period_to,declared_cash_sar,declared_card_sar,status)
    values(v_emp,coalesce(v_from,(current_date - interval '1 year')::date),current_date,
           coalesce(p_declared_cash,0),coalesce(p_declared_card,0),'pending') returning id into v_id;
  insert into exhibitions.notifications(recipient_id,type,title,body,ref_table,ref_id)
    select id,'settlement','تسليم عهدة جديد','موظف سلّم عهدة بانتظار التأكيد','consignment_settlements',v_id
      from exhibitions.profiles where role='admin' and status='active';
  return v_id;
end $$;

create or replace function exhibitions.confirm_settlement(
  p_settlement_id uuid, p_action text, p_confirmed_amount numeric default null, p_shortage_reason text default null)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_actor uuid; v_total numeric; v_emp uuid; v_conf numeric;
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  v_actor := exhibitions.current_profile_id();
  select total_declared_sar,employee_id into v_total,v_emp from exhibitions.consignment_settlements where id=p_settlement_id;
  v_conf := coalesce(p_confirmed_amount,v_total);
  update exhibitions.consignment_settlements set
    status = (case when p_action='accept' then 'accepted' else 'rejected' end)::exhibitions.settlement_status,
    admin_confirmed_amount_sar = v_conf,
    shortage_sar = v_total - v_conf,
    shortage_reason = p_shortage_reason,
    confirmed_by = v_actor, confirmed_at = now()
   where id=p_settlement_id;
  insert into exhibitions.notifications(recipient_id,type,title,body,ref_table,ref_id)
    values(v_emp,'settlement_result',
      case when p_action='accept' then 'تم قبول تسليم العهدة' else 'تم رفض تسليم العهدة' end,
      coalesce(p_shortage_reason, case when v_total-v_conf>0 then 'يوجد عجز: '||(v_total-v_conf)::text||' ر.س' else 'تم بدون عجز' end),
      'consignment_settlements',p_settlement_id);
end $$;

-- ============================================================
-- Wholesale (IM/admin, from warehouse, no commission)
-- ============================================================
create or replace function exhibitions.create_wholesale_order(
  p_customer_name text, p_customer_phone text, p_warehouse_id uuid, p_payment_method text, p_items jsonb)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_actor uuid; v_order uuid; r jsonb; v_total numeric:=0; v_qty int; v_price numeric; v_pid uuid;
begin
  if not exhibitions._im_can('can_issue_wholesale') then raise exception 'غير مصرّح بالبيع جملة'; end if;
  v_actor := exhibitions.current_profile_id();
  insert into exhibitions.wholesale_orders(customer_name,customer_phone,warehouse_id,payment_method,total_sar,issued_by)
    values(p_customer_name,p_customer_phone,p_warehouse_id,p_payment_method::exhibitions.payment_method,0,v_actor) returning id into v_order;
  for r in select * from jsonb_array_elements(p_items) loop
    v_pid:=(r->>'product_id')::uuid; v_qty:=(r->>'qty')::int; v_price:=(r->>'unit_price')::numeric;
    insert into exhibitions.wholesale_order_items(order_id,product_id,qty,unit_price_sar)
      values(v_order,v_pid,v_qty,v_price);
    perform exhibitions._move_stock(v_pid,v_qty,'warehouse',p_warehouse_id,null,null,'wholesale','wholesale_orders',v_order,v_actor);
    v_total := v_total + (v_qty*v_price);
  end loop;
  update exhibitions.wholesale_orders set total_sar=v_total where id=v_order;
  return json_build_object('order_id',v_order,'total',v_total);
end $$;

-- ============================================================
-- Close branch: return remaining branch stock to source warehouse
-- ============================================================
create or replace function exhibitions.close_branch(p_branch_id uuid)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_actor uuid; v_wh uuid; v_transfer uuid; rec record;
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  v_actor := exhibitions.current_profile_id();
  select source_warehouse_id into v_wh from exhibitions.branches where id=p_branch_id;
  if v_wh is not null then
    insert into exhibitions.stock_transfers(type,from_location_type,from_location_id,to_location_type,to_location_id,issued_by,status)
      values('return','branch',p_branch_id,'warehouse',v_wh,v_actor,'completed') returning id into v_transfer;
    for rec in select product_id,quantity from exhibitions.inventory
      where location_type='branch' and location_id=p_branch_id and quantity>0 loop
      insert into exhibitions.stock_transfer_items(transfer_id,product_id,qty) values(v_transfer,rec.product_id,rec.quantity);
      perform exhibitions._move_stock(rec.product_id,rec.quantity,'branch',p_branch_id,'warehouse',v_wh,
        'transfer_return','stock_transfers',v_transfer,v_actor);
    end loop;
  end if;
  update exhibitions.branches set status='closed' where id=p_branch_id;
  return v_transfer;
end $$;

-- ============================================================
-- Finance / reporting
-- ============================================================
create or replace function exhibitions.branch_pnl(p_branch_id uuid)
returns json language sql stable security definer set search_path=exhibitions,public as $$
  with s as (
    select coalesce(sum(si.qty*si.unit_sale_price_sar),0) sales,
           coalesce(sum(si.qty*si.unit_cost_snapshot_sar),0) cost
      from exhibitions.sales sa join exhibitions.sale_items si on si.sale_id=sa.id
     where sa.branch_id=p_branch_id and sa.status='completed'),
  r as (select coalesce(sum(refund_amount_sar),0) refunds from exhibitions.sale_returns where branch_id=p_branch_id),
  e as (select coalesce(sum(amount_sar),0) expenses from exhibitions.expenses where branch_id=p_branch_id),
  c as (select coalesce(sum(commission_sar),0) commissions from exhibitions.commissions where branch_id=p_branch_id and status<>'cancelled')
  select json_build_object(
    'branch_id',p_branch_id,
    'net_sales',(s.sales - r.refunds),
    'cost',s.cost,
    'expenses',e.expenses,
    'commissions',c.commissions,
    'net_profit',(s.sales - r.refunds) - s.cost - e.expenses - c.commissions
  ) from s,r,e,c;
$$;

create or replace function exhibitions.compute_branch_commission(p_branch_id uuid)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_target numeric; v_pct numeric; v_mode exhibitions.commission_mode; v_mgr uuid;
        v_achieved numeric; v_total_comm numeric; rec record;
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  select target_amount_sar,commission_percentage,coalesce(commission_mode,'proportional'),manager_id
    into v_target,v_pct,v_mode,v_mgr from exhibitions.branches where id=p_branch_id;
  select coalesce(sum(si.qty*si.unit_sale_price_sar),0) into v_achieved
    from exhibitions.sales sa join exhibitions.sale_items si on si.sale_id=sa.id
   where sa.branch_id=p_branch_id and sa.status='completed';
  delete from exhibitions.commissions where branch_id=p_branch_id and status='pending';
  if v_target<=0 or v_achieved < v_target then
    return json_build_object('reached',false,'achieved',v_achieved,'target',v_target,'commission',0);
  end if;
  v_total_comm := v_achieved * v_pct/100.0;
  if v_mode='single_manager' then
    insert into exhibitions.commissions(branch_id,beneficiary_id,target_amount_sar,achieved_amount_sar,commission_pct,commission_sar)
      values(p_branch_id,v_mgr,v_target,v_achieved,v_pct,v_total_comm);
  elsif v_mode='proportional' then
    for rec in select sa.employee_id, sum(si.qty*si.unit_sale_price_sar) emp_sales
        from exhibitions.sales sa join exhibitions.sale_items si on si.sale_id=sa.id
       where sa.branch_id=p_branch_id and sa.status='completed' and sa.employee_id is not null
       group by sa.employee_id loop
      insert into exhibitions.commissions(branch_id,beneficiary_id,target_amount_sar,achieved_amount_sar,commission_pct,commission_sar)
        values(p_branch_id,rec.employee_id,v_target,v_achieved,v_pct, v_total_comm*(rec.emp_sales/v_achieved));
    end loop;
  else -- manual_pool
    insert into exhibitions.commissions(branch_id,beneficiary_id,target_amount_sar,achieved_amount_sar,commission_pct,commission_sar)
      values(p_branch_id,null,v_target,v_achieved,v_pct,v_total_comm);
  end if;
  return json_build_object('reached',true,'achieved',v_achieved,'target',v_target,'commission',v_total_comm,'mode',v_mode);
end $$;

create or replace function exhibitions.compute_payroll(p_employee_id uuid, p_period_month text)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_salary numeric; v_days int; v_present int; v_rate numeric; v_adv numeric; v_comm numeric;
        v_gross numeric; v_net numeric; v_start date; v_end date;
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  v_start := to_date(p_period_month||'-01','YYYY-MM-DD');
  v_end := (v_start + interval '1 month - 1 day')::date;
  v_days := extract(day from v_end)::int;
  select coalesce(monthly_salary_sar,0) into v_salary from exhibitions.employee_details where profile_id=p_employee_id;
  v_salary := coalesce(v_salary,0);
  v_rate := case when v_days>0 then v_salary/v_days else 0 end;
  select count(*) into v_present from exhibitions.attendance
    where employee_id=p_employee_id and status='present' and work_date between v_start and v_end;
  select coalesce(sum(amount_sar),0) into v_adv from exhibitions.salary_advances
    where employee_id=p_employee_id and created_at::date between v_start and v_end;
  select coalesce(sum(commission_sar),0) into v_comm from exhibitions.commissions
    where beneficiary_id=p_employee_id and status in ('approved','paid');
  v_gross := v_rate*v_present;
  v_net := v_gross - v_adv + v_comm;
  insert into exhibitions.payroll(employee_id,period_month,monthly_salary_sar,daily_rate_sar,present_days,gross_sar,advances_deducted_sar,commission_sar,net_sar,status)
    values(p_employee_id,p_period_month,v_salary,v_rate,v_present,v_gross,v_adv,v_comm,v_net,'draft')
  on conflict (employee_id,period_month) do update set
    monthly_salary_sar=excluded.monthly_salary_sar, daily_rate_sar=excluded.daily_rate_sar,
    present_days=excluded.present_days, gross_sar=excluded.gross_sar,
    advances_deducted_sar=excluded.advances_deducted_sar, commission_sar=excluded.commission_sar,
    net_sar=excluded.net_sar;
  return json_build_object('present_days',v_present,'daily_rate',v_rate,'gross',v_gross,'advances',v_adv,'commission',v_comm,'net',v_net);
end $$;

-- ============================================================
-- Employee dashboard (no cost exposed)
-- ============================================================
create or replace function exhibitions.employee_dashboard(p_token uuid, p_branch_id uuid default null)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_emp uuid; v_today numeric; v_consign json; v_target json; v_pending_settlement numeric;
begin
  v_emp := exhibitions._employee_from_token(p_token);
  select coalesce(sum(total_sar),0) into v_today from exhibitions.sales
    where employee_id=v_emp and created_at::date=current_date and status='completed';
  select coalesce(json_agg(json_build_object('product_id',i.product_id,'name',pr.name,'code',pr.product_code,'qty',i.quantity)),'[]')
    into v_consign from exhibitions.inventory i join exhibitions.products pr on pr.id=i.product_id
   where i.location_type='employee_consignment' and i.location_id=v_emp and i.quantity>0;
  if p_branch_id is not null then
    select json_build_object('target',b.target_amount_sar,
        'achieved',(select coalesce(sum(total_sar),0) from exhibitions.sales where branch_id=p_branch_id and status='completed'))
      into v_target from exhibitions.branches b where b.id=p_branch_id;
  end if;
  return json_build_object('employee_id',v_emp,'sales_today',v_today,'consignment',v_consign,'branch_target',v_target);
end $$;

-- ============================================================
-- Grants + lock down internal helpers
-- ============================================================
grant execute on all functions in schema exhibitions to anon, authenticated, service_role;
revoke execute on function exhibitions._move_stock(uuid,integer,exhibitions.location_type,uuid,exhibitions.location_type,uuid,exhibitions.movement_type,text,uuid,uuid) from anon, authenticated;
revoke execute on function exhibitions._employee_from_token(uuid) from anon, authenticated;
revoke execute on function exhibitions._im_can(text) from anon, authenticated;
