-- ============================================================
-- تدقيق العزل | Migration 025
-- دوال SECURITY DEFINER كانت مقيّدة بالدور (is_admin/_im_can) لكنها تعمل على
-- كيان عبر معرّفه دون التحقق أنه يعود لنفس المستأجر. بما أن SECURITY DEFINER
-- يتجاوز RLS (والمساعدات _move_stock/_post لا تحصر على المستأجر)، نضيف فحص
-- ملكية المستأجر في كل نقطة دخول (دفاع متعمّق ضد عبور المستأجرين بمعرف معروف).
-- الدوال: close_branch, reconcile_and_close_branch, confirm_settlement,
--         review_stock_request, set_commission_status, pay_supplier,
--         create_wholesale_order.
-- ============================================================

create or replace function exhibitions.close_branch(p_branch_id uuid)
returns uuid language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_wh uuid; v_transfer uuid; rec record;
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  if not exists(select 1 from exhibitions.branches where id=p_branch_id and tenant_id=exhibitions.current_tenant_id()) then
    raise exception 'المعرض غير موجود'; end if;
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
end $function$;

create or replace function exhibitions.reconcile_and_close_branch(p_branch_id uuid, p_counts jsonb default '[]'::jsonb)
returns json language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_wh uuid; v_transfer uuid; rec record; v_recv int; v_loss int; v_cost numeric; v_total_loss numeric:=0;
begin
  if not exhibitions.is_admin() and not exhibitions._im_can('can_receive_returns') then raise exception 'غير مصرّح'; end if;
  if not exists(select 1 from exhibitions.branches where id=p_branch_id and tenant_id=exhibitions.current_tenant_id()) then
    raise exception 'المعرض غير موجود'; end if;
  v_actor := exhibitions.current_profile_id();
  select source_warehouse_id into v_wh from exhibitions.branches where id=p_branch_id;
  insert into exhibitions.stock_transfers(type,from_location_type,from_location_id,to_location_type,to_location_id,issued_by,status)
    values('return','branch',p_branch_id,'warehouse',coalesce(v_wh,p_branch_id),v_actor,'completed') returning id into v_transfer;
  drop table if exists _bclose;
  create temporary table _bclose on commit drop as
    select product_id, quantity from exhibitions.inventory where location_type='branch' and location_id=p_branch_id and quantity>0;
  for rec in select * from _bclose loop
    select (c->>'received')::int into v_recv from jsonb_array_elements(p_counts) c where (c->>'product_id')::uuid = rec.product_id limit 1;
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
end $function$;

create or replace function exhibitions.confirm_settlement(p_settlement_id uuid, p_action text, p_confirmed_amount numeric default null, p_shortage_reason text default null)
returns void language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_total numeric; v_emp uuid; v_conf numeric;
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  if not exists(select 1 from exhibitions.consignment_settlements where id=p_settlement_id and tenant_id=exhibitions.current_tenant_id()) then
    raise exception 'السجل غير موجود'; end if;
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
end $function$;

create or replace function exhibitions.review_stock_request(p_request_id uuid, p_action text, p_approvals jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_branch uuid; v_wh uuid; v_transfer uuid; r jsonb; v_qty int; v_any int:=0;
begin
  if not exhibitions._im_can('can_approve_requests') then raise exception 'غير مصرّح بمراجعة الطلبات'; end if;
  v_actor := exhibitions.current_profile_id();
  select branch_id into v_branch from exhibitions.stock_requests where id=p_request_id and tenant_id=exhibitions.current_tenant_id();
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
end $function$;

create or replace function exhibitions.set_commission_status(p_branch_id uuid, p_status text)
returns integer language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare n integer; v_sum numeric;
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  if not exists(select 1 from exhibitions.branches where id=p_branch_id and tenant_id=exhibitions.current_tenant_id()) then
    raise exception 'المعرض غير موجود'; end if;
  drop table if exists _chg;
  create temporary table _chg on commit drop as
  with upd as (
    update exhibitions.commissions set status = p_status::exhibitions.commission_status
     where branch_id = p_branch_id and tenant_id=exhibitions.current_tenant_id()
       and status <> 'cancelled' and status <> p_status::exhibitions.commission_status
    returning id, beneficiary_id, commission_sar)
  select * from upd;
  select count(*), coalesce(sum(commission_sar),0) into n, v_sum from _chg;
  perform exhibitions._audit('commission_'||p_status,'commissions',p_branch_id,null,jsonb_build_object('count',n));
  if p_status='approved' and v_sum>0 then
    perform exhibitions._post(current_date,'استحقاق عمولات','commissions',p_branch_id,
      jsonb_build_array(jsonb_build_object('account','5300','debit',v_sum,'credit',0),
        jsonb_build_object('account','2200','debit',0,'credit',v_sum)));
  elsif p_status='paid' and v_sum>0 then
    perform exhibitions._post(current_date,'صرف عمولات','commissions',p_branch_id,
      jsonb_build_array(jsonb_build_object('account','2200','debit',v_sum,'credit',0),
        jsonb_build_object('account','1010','debit',0,'credit',v_sum)));
  end if;
  if p_status in ('approved','paid') then
    insert into exhibitions.notifications(recipient_id,type,title,body,ref_table,ref_id)
      select beneficiary_id,'commission',
        case when p_status='paid' then 'تم صرف العمولة' else 'تم اعتماد العمولة' end,
        'عمولة معرض بقيمة '||commission_sar::text||' ر.س','commissions',id
      from _chg where beneficiary_id is not null;
  end if;
  return n;
end $function$;

create or replace function exhibitions.pay_supplier(p_supplier_id uuid, p_amount numeric, p_method text default 'cash', p_notes text default null)
returns uuid language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_id uuid; v_cash text;
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  if not exists(select 1 from exhibitions.suppliers where id=p_supplier_id and tenant_id=exhibitions.current_tenant_id()) then
    raise exception 'المورد غير موجود'; end if;
  insert into exhibitions.supplier_payments(supplier_id,amount_sar,method,notes,created_by)
    values(p_supplier_id,p_amount,p_method::exhibitions.payment_method,p_notes,exhibitions.current_profile_id()) returning id into v_id;
  v_cash := case when p_method='card' then '1020' else '1010' end;
  perform exhibitions._post(current_date,'سداد مورد','supplier_payments',v_id,
    jsonb_build_array(jsonb_build_object('account','2010','debit',p_amount,'credit',0),
      jsonb_build_object('account',v_cash,'debit',0,'credit',p_amount)));
  return v_id;
end $function$;

create or replace function exhibitions.create_wholesale_order(p_customer_name text, p_customer_phone text, p_warehouse_id uuid, p_payment_method text, p_items jsonb)
returns json language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_actor uuid; v_order uuid; r jsonb; v_total numeric:=0; v_qty int; v_price numeric; v_pid uuid; v_t uuid;
begin
  if not exhibitions._im_can('can_issue_wholesale') then raise exception 'غير مصرّح بالبيع جملة'; end if;
  v_t := exhibitions.current_tenant_id();
  if not exists(select 1 from exhibitions.warehouses where id=p_warehouse_id and tenant_id=v_t) then
    raise exception 'المستودع غير موجود'; end if;
  v_actor := exhibitions.current_profile_id();
  insert into exhibitions.wholesale_orders(customer_name,customer_phone,warehouse_id,payment_method,total_sar,issued_by)
    values(p_customer_name,p_customer_phone,p_warehouse_id,p_payment_method::exhibitions.payment_method,0,v_actor) returning id into v_order;
  for r in select * from jsonb_array_elements(p_items) loop
    v_pid:=(r->>'product_id')::uuid; v_qty:=(r->>'qty')::int; v_price:=(r->>'unit_price')::numeric;
    if not exists(select 1 from exhibitions.products where id=v_pid and tenant_id=v_t) then
      raise exception 'منتج غير صحيح'; end if;
    insert into exhibitions.wholesale_order_items(order_id,product_id,qty,unit_price_sar)
      values(v_order,v_pid,v_qty,v_price);
    perform exhibitions._move_stock(v_pid,v_qty,'warehouse',p_warehouse_id,null,null,'wholesale','wholesale_orders',v_order,v_actor);
    v_total := v_total + (v_qty*v_price);
  end loop;
  update exhibitions.wholesale_orders set total_sar=v_total where id=v_order;
  return json_build_object('order_id',v_order,'total',v_total);
end $function$;
