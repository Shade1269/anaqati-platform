-- ============================================================
-- نظام المعارض — طبقة الوصول للتطبيق (Migration 003)
-- بوّابة دخول الأدمن/مدير المخزون + قراءات الموظف + عرض بدون تكلفة
-- ============================================================

-- ---------- ملف المستخدم الحالي (أدمن/مدير مخزون عبر Supabase Auth) ----------
create or replace function exhibitions.my_profile()
returns json language sql stable security definer set search_path=exhibitions,public as $$
  select row_to_json(p) from (
    select pr.id, pr.full_name, pr.role, pr.status,
      (select row_to_json(x) from (
         select can_add_stock,can_approve_requests,can_issue_transfers,can_issue_wholesale,can_receive_returns
           from exhibitions.im_permissions where profile_id=pr.id) x) as permissions
      from exhibitions.profiles pr where pr.auth_user_id=auth.uid()
  ) p;
$$;

-- أول مستخدم يسجّل = أدمن، الباقي = مدير مخزون (الأدمن يفعّل صلاحياته لاحقًا)
create or replace function exhibitions.ensure_my_profile(p_full_name text default null)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_id uuid; v_role exhibitions.user_role; v_has_admin boolean;
begin
  if auth.uid() is null then raise exception 'لازم تسجّل الدخول أولًا'; end if;
  select id into v_id from exhibitions.profiles where auth_user_id=auth.uid();
  if v_id is null then
    select exists(select 1 from exhibitions.profiles where role='admin') into v_has_admin;
    v_role := (case when v_has_admin then 'inventory_manager' else 'admin' end)::exhibitions.user_role;
    insert into exhibitions.profiles(auth_user_id,full_name,role,status)
      values(auth.uid(), coalesce(nullif(p_full_name,''),'مستخدم'), v_role, 'active') returning id into v_id;
    if v_role='inventory_manager' then
      insert into exhibitions.im_permissions(profile_id) values(v_id) on conflict do nothing;
    end if;
  end if;
  return exhibitions.my_profile();
end $$;

-- الأدمن يغيّر دور/حالة مستخدم
create or replace function exhibitions.set_user_role(p_profile_id uuid, p_role text, p_status text default 'active')
returns void language plpgsql security definer set search_path=exhibitions,public as $$
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  update exhibitions.profiles set role=p_role::exhibitions.user_role, status=p_status::exhibitions.user_status where id=p_profile_id;
  if p_role='inventory_manager' then
    insert into exhibitions.im_permissions(profile_id) values(p_profile_id) on conflict do nothing;
  end if;
end $$;

-- ---------- قراءات الموظف (عبر التوكن، بدون تكلفة) ----------
create or replace function exhibitions.list_products_for_employee(p_token uuid)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
begin
  perform exhibitions._employee_from_token(p_token);
  return (select coalesce(json_agg(json_build_object(
      'id',id,'code',product_code,'name',name,'price_ref',sale_price_ref,'category_id',category_id)),'[]')
    from exhibitions.products where is_active=true);
end $$;

create or replace function exhibitions.list_branches_for_employee(p_token uuid)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
begin
  perform exhibitions._employee_from_token(p_token);
  return (select coalesce(json_agg(json_build_object(
      'id',id,'name',name,'location',location,'status',status)),'[]')
    from exhibitions.branches where status in ('planning','active'));
end $$;

-- ---------- عرض المنتجات بدون تكلفة (للأدمن/مدير المخزون في الواجهة) ----------
create or replace view exhibitions.products_public as
  select id,product_code,name,category_id,sale_price_ref,supplier_id,is_active,created_at
    from exhibitions.products;
grant select on exhibitions.products_public to authenticated;

-- ---------- سياسات قراءة لمدير المخزون (بدون أرباح/تكلفة) ----------
do $$
declare t text;
begin
  foreach t in array array[
    'branches','warehouses','suppliers','categories','inventory',
    'stock_requests','stock_request_items','stock_transfers','stock_transfer_items',
    'stock_receipts','stock_receipt_items','wholesale_orders','wholesale_order_items',
    'consignment_withdrawals','notifications']
  loop
    execute format('drop policy if exists im_select on exhibitions.%I', t);
    execute format('create policy im_select on exhibitions.%I for select to authenticated using (exhibitions.is_inventory_manager())', t);
  end loop;
end $$;

-- ---------- grants للدوال الجديدة ----------
grant execute on function exhibitions.my_profile() to authenticated;
grant execute on function exhibitions.ensure_my_profile(text) to authenticated;
grant execute on function exhibitions.set_user_role(uuid,text,text) to authenticated;
grant execute on function exhibitions.list_products_for_employee(uuid) to anon, authenticated;
grant execute on function exhibitions.list_branches_for_employee(uuid) to anon, authenticated;
