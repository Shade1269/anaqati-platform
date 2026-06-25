-- ============================================================
-- عملة المشترك | Migration 020
-- عملة لكل مشترك (افتراضي SAR) للسوق متعدد البلدان — خاصة سوريا (SYP/USD).
-- تُعرض في كل الواجهة عبر منسّق مركزي. update_tenant_branding يضبطها،
-- my_profile/store_info/employee_login تُرجِعها.
-- ============================================================
alter table exhibitions.tenants add column if not exists currency text not null default 'SAR';

create or replace function exhibitions.update_tenant_branding(p_tenant_id uuid, p_brand_name text, p_logo_url text default null, p_primary_color text default null, p_currency text default null)
returns void language plpgsql security definer set search_path to 'exhibitions','public' as $function$
begin
  if not (exhibitions.is_platform_admin() or (exhibitions.is_admin() and p_tenant_id=exhibitions.current_tenant_id())) then
    raise exception 'غير مصرّح'; end if;
  update exhibitions.tenants set
    brand_name = coalesce(nullif(p_brand_name,''), brand_name),
    logo_url = coalesce(p_logo_url, logo_url),
    primary_color = coalesce(nullif(p_primary_color,''), primary_color),
    currency = coalesce(nullif(p_currency,''), currency)
  where id=p_tenant_id;
end $function$;
grant execute on function exhibitions.update_tenant_branding(uuid,text,text,text,text) to authenticated;

-- my_profile / store_info / employee_login تُرجِع currency (انظر القاعدة للنسخ المطبّقة)
