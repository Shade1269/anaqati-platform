-- ============================================================
-- التسعير المزدوج وسعر الصرف اليومي | Migration 022
-- عملة ثانوية + fx_rate لكل مشترك (تسعير بالأساسية وعرض ما يعادلها
-- بالثانوية على سعر اليوم — حالة السوق السوري: دولار↔ليرة).
-- update_tenant_branding/my_profile/store_info/employee_login تشملها.
-- (النسخ الكاملة مطبّقة على القاعدة الحيّة.)
-- ============================================================
alter table exhibitions.tenants add column if not exists secondary_currency text;
alter table exhibitions.tenants add column if not exists fx_rate numeric(18,6);
