-- ============================================================
-- إصلاح تعدد المستأجرين: جوال الموظف فريد لكل عميل لا عالميًا | Migration 015
-- كان هناك قيد فريد عالمي على profiles.phone يمنع عميلين مختلفين من
-- استخدام نفس رقم الجوال لموظفيهما. صار الآن فريدًا داخل العميل الواحد فقط.
-- ============================================================
alter table exhibitions.profiles drop constraint if exists profiles_phone_key;
create unique index if not exists profiles_tenant_phone_uniq
  on exhibitions.profiles(tenant_id, phone)
  where phone is not null;
