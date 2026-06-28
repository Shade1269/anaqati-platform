-- ============================================================
-- استيراد الكيانات (ترحيل نظام كامل) | Migration 054
-- يكمل import_products (053): يضيف استيراد العملاء (بأرصدتهم الافتتاحية)،
-- الموردين، والفئات — لنقل نظام كامل من البيان/الأمين.
-- الرصيد الافتتاحي للعميل يُسجَّل محاسبيًا: مدين 1300 ذمم العملاء /
-- دائن 3010 رأس المال (رصيد افتتاحي). idempotent عبر وسم القيد.
-- الصلاحية: المالك أو مدير بصلاحية can_manage_store.
-- ============================================================

create or replace function exhibitions._import_tenant() returns uuid
language plpgsql stable security definer set search_path=exhibitions,public as $$
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_manage_store') or exhibitions._im_can('can_add_stock')) then
    raise exception 'غير مصرّح'; end if;
  return exhibitions.current_tenant_id();
end $$;
revoke execute on function exhibitions._import_tenant() from public, anon, authenticated;

-- استيراد العملاء — كل صف: {name, phone?, credit_limit?, opening_balance?, note?}
create or replace function exhibitions.import_customers(p_rows jsonb)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare
  v_t uuid := exhibitions._import_tenant(); v_actor uuid := exhibitions.current_profile_id(); r jsonb;
  v_name text; v_phone text; v_limit numeric; v_open numeric; v_note text;
  v_cid uuid; v_e uuid; v_created int:=0; v_updated int:=0; v_bal int:=0; v_idx int:=0; v_errors jsonb:='[]'::jsonb;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    v_idx := v_idx + 1;
    begin
      v_name := nullif(trim(r->>'name'),'');
      if v_name is null then v_errors := v_errors || jsonb_build_object('row',v_idx,'message','الاسم مطلوب'); continue; end if;
      v_phone := nullif(trim(r->>'phone'),'');
      v_limit := greatest(coalesce(nullif(r->>'credit_limit','')::numeric,0),0);
      v_open  := coalesce(nullif(r->>'opening_balance','')::numeric,0);
      v_note  := nullif(trim(r->>'note'),'');

      -- مطابقة: بالهاتف إن وُجد، وإلا بالاسم
      v_cid := null;
      if v_phone is not null then
        select id into v_cid from exhibitions.customers where tenant_id=v_t and phone=v_phone limit 1;
      end if;
      if v_cid is null then
        select id into v_cid from exhibitions.customers where tenant_id=v_t and name=v_name limit 1;
      end if;

      if v_cid is null then
        insert into exhibitions.customers(tenant_id,name,phone,note,credit_limit,is_active)
          values(v_t,v_name,v_phone,v_note,v_limit,true) returning id into v_cid;
        v_created := v_created + 1;
      else
        update exhibitions.customers set name=v_name,
          phone=coalesce(v_phone,phone), note=coalesce(v_note,note), credit_limit=v_limit
          where id=v_cid;
        v_updated := v_updated + 1;
      end if;

      -- الرصيد الافتتاحي (دين على العميل) — idempotent عبر الوسم
      if v_open > 0 and not exists(
        select 1 from exhibitions.customer_entries where customer_id=v_cid and tenant_id=v_t and note='رصيد افتتاحي (ترحيل)') then
        insert into exhibitions.customer_entries(tenant_id,customer_id,kind,amount,note,created_by)
          values(v_t,v_cid,'charge',v_open,'رصيد افتتاحي (ترحيل)',v_actor) returning id into v_e;
        perform exhibitions._post(current_date,'رصيد عميل افتتاحي (ترحيل)','customer_entries',v_e,
          jsonb_build_array(jsonb_build_object('account','1300','debit',v_open,'credit',0),
                            jsonb_build_object('account','3010','debit',0,'credit',v_open)));
        v_bal := v_bal + 1;
      end if;
    exception when others then
      v_errors := v_errors || jsonb_build_object('row',v_idx,'name',coalesce(v_name,''),'message',SQLERRM);
    end;
  end loop;
  return json_build_object('created',v_created,'updated',v_updated,'with_opening_balance',v_bal,'errors',v_errors);
end $$;

-- استيراد الموردين — كل صف: {name, phone?, note?}
create or replace function exhibitions.import_suppliers(p_rows jsonb)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare
  v_t uuid := exhibitions._import_tenant(); r jsonb;
  v_name text; v_phone text; v_note text; v_sid uuid;
  v_created int:=0; v_updated int:=0; v_idx int:=0; v_errors jsonb:='[]'::jsonb;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    v_idx := v_idx + 1;
    begin
      v_name := nullif(trim(r->>'name'),'');
      if v_name is null then v_errors := v_errors || jsonb_build_object('row',v_idx,'message','الاسم مطلوب'); continue; end if;
      v_phone := nullif(trim(r->>'phone'),'');
      v_note  := nullif(trim(r->>'note'),'');
      select id into v_sid from exhibitions.suppliers where tenant_id=v_t and name=v_name limit 1;
      if v_sid is null then
        insert into exhibitions.suppliers(tenant_id,name,phone,notes,is_active) values(v_t,v_name,v_phone,v_note,true);
        v_created := v_created + 1;
      else
        update exhibitions.suppliers set phone=coalesce(v_phone,phone), notes=coalesce(v_note,notes) where id=v_sid;
        v_updated := v_updated + 1;
      end if;
    exception when others then
      v_errors := v_errors || jsonb_build_object('row',v_idx,'name',coalesce(v_name,''),'message',SQLERRM);
    end;
  end loop;
  return json_build_object('created',v_created,'updated',v_updated,'errors',v_errors);
end $$;

-- استيراد الفئات — كل صف: {name}
create or replace function exhibitions.import_categories(p_rows jsonb)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare
  v_t uuid := exhibitions._import_tenant(); r jsonb; v_name text; v_created int:=0; v_skipped int:=0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    v_name := nullif(trim(r->>'name'),'');
    if v_name is null then continue; end if;
    if exists(select 1 from exhibitions.categories where tenant_id=v_t and name=v_name) then
      v_skipped := v_skipped + 1;
    else
      insert into exhibitions.categories(tenant_id,name) values(v_t,v_name);
      v_created := v_created + 1;
    end if;
  end loop;
  return json_build_object('created',v_created,'skipped',v_skipped,'errors','[]'::jsonb);
end $$;

grant execute on function exhibitions.import_customers(jsonb) to authenticated;
grant execute on function exhibitions.import_suppliers(jsonb) to authenticated;
grant execute on function exhibitions.import_categories(jsonb) to authenticated;
