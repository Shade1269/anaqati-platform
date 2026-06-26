-- ============================================================
-- تدقيق العزل | Migration 024
-- set_user_role كان مقيّدًا is_admin() لكنه لا يتحقق أن الملف ضمن نفس
-- المستأجر (بخلاف set_im_permissions). نضيف فحص المستأجر لسدّ ثغرة عبور
-- المستأجرين (تغيير دور/حالة ملف في مستأجر آخر عبر معرفته).
-- بما أن SECURITY DEFINER يتجاوز RLS، الفحص اليدوي ضروري.
-- ============================================================
create or replace function exhibitions.set_user_role(p_profile_id uuid, p_role text, p_status text default 'active')
returns void language plpgsql security definer set search_path to 'exhibitions','public' as $function$
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  if not exists(select 1 from exhibitions.profiles
                where id=p_profile_id and tenant_id=exhibitions.current_tenant_id()) then
    raise exception 'المستخدم غير موجود';
  end if;
  update exhibitions.profiles set role=p_role::exhibitions.user_role, status=p_status::exhibitions.user_status
    where id=p_profile_id and tenant_id=exhibitions.current_tenant_id();
  if p_role='inventory_manager' then
    insert into exhibitions.im_permissions(profile_id) values(p_profile_id) on conflict do nothing;
  end if;
end $function$;
