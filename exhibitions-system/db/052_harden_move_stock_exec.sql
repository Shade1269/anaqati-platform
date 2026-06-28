-- ============================================================
-- تحصين: منع الاستدعاء المباشر لـ _move_stock | Migration 052
-- _move_stock محرّك مخزون داخلي بلا فحص صلاحية (موروث من 002). كان قابلًا
-- للتنفيذ من أي مستخدم مسجّل عبر PostgREST، ما يسمح بتلاعب مباشر بالمخزون.
-- يُستدعى داخليًا فقط من دوال SECURITY DEFINER (تعمل كمالك)، لذا إلغاء صلاحية
-- التنفيذ عن public/anon/authenticated لا يؤثر على التطبيق. (كُشف عبر advisors.)
-- ============================================================

revoke execute on function exhibitions._move_stock(
  uuid, numeric, exhibitions.location_type, uuid, exhibitions.location_type, uuid,
  exhibitions.movement_type, text, uuid, uuid
) from public, anon, authenticated;
