-- ============================================================
-- رصيد المورّد الافتتاحي (إتمام ترحيل النظام) | Migration 055
-- رصيد المورّد محسوب (مشتريات − مدفوعات)؛ لإظهار رصيد افتتاحي (نَدين به للمورّد
-- عند الترحيل) نضيف عمودًا يُدمج في الحساب، ونسجّل قيدًا محاسبيًا:
--   مدين 3010 رأس المال / دائن 2010 ذمم الموردين. idempotent عبر وسم القيد.
-- الصلاحية: عبر import_suppliers (مالك أو can_manage_store/can_add_stock).
-- ============================================================

alter table exhibitions.suppliers add column if not exists opening_balance numeric(14,2) not null default 0;

create or replace function exhibitions.supplier_balances()
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  return (select coalesce(json_agg(row_to_json(s) order by s.name),'[]') from (
    select sup.id, sup.name, sup.phone,
      coalesce(sup.opening_balance,0) as opening_balance,
      coalesce((select sum(ri.qty*pr.cost_price_sar) from exhibitions.stock_receipts r
        join exhibitions.stock_receipt_items ri on ri.receipt_id=r.id
        join exhibitions.products pr on pr.id=ri.product_id where r.supplier_id=sup.id),0) as purchased,
      coalesce((select sum(amount_sar) from exhibitions.supplier_payments sp where sp.supplier_id=sup.id),0) as paid,
      coalesce(sup.opening_balance,0)
        + coalesce((select sum(ri.qty*pr.cost_price_sar) from exhibitions.stock_receipts r
            join exhibitions.stock_receipt_items ri on ri.receipt_id=r.id
            join exhibitions.products pr on pr.id=ri.product_id where r.supplier_id=sup.id),0)
        - coalesce((select sum(amount_sar) from exhibitions.supplier_payments sp where sp.supplier_id=sup.id),0) as balance
    from exhibitions.suppliers sup where sup.tenant_id=exhibitions.current_tenant_id()) s);
end $function$;

create or replace function exhibitions.import_suppliers(p_rows jsonb)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare
  v_t uuid := exhibitions._import_tenant(); v_actor uuid := exhibitions.current_profile_id(); r jsonb;
  v_name text; v_phone text; v_note text; v_open numeric; v_sid uuid;
  v_created int:=0; v_updated int:=0; v_bal int:=0; v_idx int:=0; v_errors jsonb:='[]'::jsonb;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    v_idx := v_idx + 1;
    begin
      v_name := nullif(trim(r->>'name'),'');
      if v_name is null then v_errors := v_errors || jsonb_build_object('row',v_idx,'message','الاسم مطلوب'); continue; end if;
      v_phone := nullif(trim(r->>'phone'),'');
      v_note  := nullif(trim(r->>'note'),'');
      v_open  := coalesce(nullif(r->>'opening_balance','')::numeric,0);
      select id into v_sid from exhibitions.suppliers where tenant_id=v_t and name=v_name limit 1;
      if v_sid is null then
        insert into exhibitions.suppliers(tenant_id,name,phone,notes,is_active) values(v_t,v_name,v_phone,v_note,true) returning id into v_sid;
        v_created := v_created + 1;
      else
        update exhibitions.suppliers set phone=coalesce(v_phone,phone), notes=coalesce(v_note,notes) where id=v_sid;
        v_updated := v_updated + 1;
      end if;
      if v_open > 0 and not exists(
        select 1 from exhibitions.journal_entries where tenant_id=v_t and source_table='supplier_opening' and source_id=v_sid) then
        update exhibitions.suppliers set opening_balance=v_open where id=v_sid;
        perform exhibitions._post(current_date,'رصيد مورد افتتاحي (ترحيل)','supplier_opening',v_sid,
          jsonb_build_array(jsonb_build_object('account','3010','debit',v_open,'credit',0),
                            jsonb_build_object('account','2010','debit',0,'credit',v_open)));
        v_bal := v_bal + 1;
      end if;
    exception when others then
      v_errors := v_errors || jsonb_build_object('row',v_idx,'name',coalesce(v_name,''),'message',SQLERRM);
    end;
  end loop;
  return json_build_object('created',v_created,'updated',v_updated,'with_opening_balance',v_bal,'errors',v_errors);
end $$;

grant execute on function exhibitions.import_suppliers(jsonb) to authenticated;
