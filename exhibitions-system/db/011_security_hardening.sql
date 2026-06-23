-- ============================================================
-- تصليب أمني (Security Hardening) | Migration 011
-- اكتُشف عبر مدقّق Supabase الرسمي + اختبار العزل:
--  1) products_public كان عرض SECURITY DEFINER بلا فلترة عميل → تسريب
--     منتجات بين العملاء. أُضيفت فلترة tenant_id = current_tenant_id().
--  2) دوال داخلية (مشغّلات/مساعدات) كانت قابلة للاستدعاء من PUBLIC
--     (افتراضي PostgreSQL). سُحب EXECUTE منها (تُستدعى داخليًا فقط عبر
--     دوال/مشغّلات المالك، فلا تتأثر).
-- ============================================================

create or replace view exhibitions.products_public as
  select id,product_code,name,category_id,sale_price_ref,supplier_id,is_active,created_at,tenant_id
    from exhibitions.products
   where tenant_id = exhibitions.current_tenant_id();
grant select on exhibitions.products_public to authenticated;

revoke execute on function exhibitions._post(date,text,text,uuid,jsonb) from public, anon, authenticated;
revoke execute on function exhibitions._move_stock(uuid,integer,exhibitions.location_type,uuid,exhibitions.location_type,uuid,exhibitions.movement_type,text,uuid,uuid) from public, anon, authenticated;
revoke execute on function exhibitions._set_tenant() from public, anon, authenticated;
revoke execute on function exhibitions._im_can(text) from public, anon, authenticated;
revoke execute on function exhibitions._employee_from_token(uuid) from public, anon, authenticated;
revoke execute on function exhibitions._audit(text,text,uuid,jsonb,jsonb) from public, anon, authenticated;
revoke execute on function exhibitions._audit_branches() from public, anon, authenticated;
revoke execute on function exhibitions._audit_profiles() from public, anon, authenticated;
revoke execute on function exhibitions._audit_products() from public, anon, authenticated;
revoke execute on function exhibitions._audit_settlements() from public, anon, authenticated;
revoke execute on function exhibitions._post_receipt_item() from public, anon, authenticated;
revoke execute on function exhibitions._post_sale_item() from public, anon, authenticated;
revoke execute on function exhibitions._post_sale_return_item() from public, anon, authenticated;
revoke execute on function exhibitions._post_wholesale_item() from public, anon, authenticated;
revoke execute on function exhibitions._post_expense() from public, anon, authenticated;
revoke execute on function exhibitions._post_advance() from public, anon, authenticated;
revoke execute on function exhibitions._post_settlement() from public, anon, authenticated;
revoke execute on function exhibitions._post_payroll() from public, anon, authenticated;
revoke execute on function exhibitions._notify_sms() from public, anon, authenticated;
revoke execute on function exhibitions.send_sms(text,text,jsonb) from public, anon, authenticated;
