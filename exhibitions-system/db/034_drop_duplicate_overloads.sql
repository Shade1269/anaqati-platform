-- ============================================================
-- إصلاح: حذف نسخ الدوال القديمة المكررة | Migration 034
-- عند إضافة معاملات جديدة بقيم افتراضية لدوال موجودة، بقيت النسخ القديمة
-- فتسبّبت "Could not choose the best candidate function" عند الاستدعاء
-- بالمعاملات المشتركة. نُبقي الأحدث (الأكمل) فقط.
-- ============================================================
drop function if exists exhibitions.close_table_bill(uuid,text,uuid);

drop function if exists exhibitions.set_im_permissions(uuid,boolean,boolean,boolean,boolean,boolean);
drop function if exists exhibitions.set_im_permissions(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean);
drop function if exists exhibitions.set_im_permissions(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean);
drop function if exists exhibitions.set_im_permissions(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean);

drop function if exists exhibitions.update_tenant_branding(uuid,text,text,text);
drop function if exists exhibitions.update_tenant_branding(uuid,text,text,text,text);
