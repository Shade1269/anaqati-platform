-- ============================================================
-- نوع نشاط: مورّد مواد غذائية (توزيع/جملة) | Migration 042
-- يبيع جملةً للمطاعم/الكافيهات بالآجل عبر الجملة والسوق الداخلي.
-- يعيد استخدام: الكتالوج/المخزون/الجملة/العملاء(الدين)/الموردين/المحاسبة/السوق.
-- ============================================================

create or replace function exhibitions.create_tenant(p_name text, p_admin_email text, p_admin_password text, p_brand_name text default null, p_primary_color text default '#C9A24B', p_subscription_expires date default null, p_business_type text default 'retail', p_business_subtype text default 'general')
returns json language plpgsql security definer set search_path to 'exhibitions','public','extensions' as $function$
declare v_t uuid; v_uid uuid; v_pid uuid; v_email text := lower(trim(p_admin_email));
        v_btype text := case when p_business_type in ('restaurant','manufacturing','distribution') then p_business_type else 'retail' end;
        v_sub text := case when p_business_subtype in ('plastics','wood','metal') then p_business_subtype else 'general' end;
begin
  if not exhibitions.is_platform_admin() then raise exception 'غير مصرّح'; end if;
  if exists(select 1 from auth.users where email=v_email) then raise exception 'البريد الإلكتروني مستخدم مسبقًا'; end if;
  insert into exhibitions.tenants(name,brand_name,primary_color,subscription_expires_at,business_type,business_subtype)
    values(p_name, coalesce(nullif(p_brand_name,''),p_name), coalesce(p_primary_color,'#C9A24B'), p_subscription_expires, v_btype, v_sub) returning id into v_t;
  v_uid := gen_random_uuid();
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,
     raw_app_meta_data,raw_user_meta_data,is_super_admin,confirmation_token,email_change,email_change_token_new,recovery_token)
   values('00000000-0000-0000-0000-000000000000',v_uid,'authenticated','authenticated',v_email,
     extensions.crypt(p_admin_password, extensions.gen_salt('bf')),now(),now(),now(),
     '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,false,'','','','');
  insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
   values(gen_random_uuid(),v_email,v_uid,json_build_object('sub',v_uid::text,'email',v_email,'email_verified',true)::jsonb,'email',now(),now(),now());
  insert into exhibitions.profiles(auth_user_id,full_name,role,status,tenant_id)
    values(v_uid, p_name||' - مدير', 'admin','active', v_t) returning id into v_pid;
  return json_build_object('tenant_id',v_t,'admin_email',v_email,'profile_id',v_pid,'business_type',v_btype,'business_subtype',v_sub);
end $function$;

create or replace function exhibitions.distribution_dashboard()
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
declare v_t uuid; v_from date; v_to date;
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  v_t := exhibitions.current_tenant_id();
  v_from := date_trunc('month', current_date)::date;
  v_to := (date_trunc('month', current_date) + interval '1 month')::date;
  return json_build_object(
    'customers_count', (select count(*) from exhibitions.customers where tenant_id=v_t and is_active),
    'total_receivable', (select coalesce(sum(b),0) from (
        select (select coalesce(sum(case when e.kind='charge' then e.amount else -e.amount end),0)
                from exhibitions.customer_entries e where e.customer_id=c.id) as b
        from exhibitions.customers c where c.tenant_id=v_t) x where b>0),
    'wholesale_month_total', (select coalesce(sum(total_sar),0) from exhibitions.wholesale_orders
        where tenant_id=v_t and created_at>=v_from and created_at<v_to),
    'wholesale_month_count', (select count(*) from exhibitions.wholesale_orders
        where tenant_id=v_t and created_at>=v_from and created_at<v_to),
    'market_orders_month', (select count(*) from exhibitions.market_orders
        where seller_tenant_id=v_t and created_at>=v_from and created_at<v_to),
    'top_debtors', (select coalesce(json_agg(x order by x.balance desc),'[]') from (
        select c.name, c.phone,
          (select coalesce(sum(case when e.kind='charge' then e.amount else -e.amount end),0)
           from exhibitions.customer_entries e where e.customer_id=c.id) as balance
        from exhibitions.customers c where c.tenant_id=v_t) x where x.balance>0 limit 8),
    'recent_wholesale', (select coalesce(json_agg(json_build_object(
        'customer_name',customer_name,'total',total_sar,'created_at',created_at) order by created_at desc),'[]')
        from (select customer_name,total_sar,created_at from exhibitions.wholesale_orders
              where tenant_id=v_t order by created_at desc limit 8) w)
  );
end $function$;

grant execute on function exhibitions.distribution_dashboard() to authenticated;
