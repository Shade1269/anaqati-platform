-- ============================================================
-- نظام المعارض — قائمة مبيعات الموظف (لشاشة الإرجاع) | Migration 007
-- بدون تكلفة — يُستدعى بالتوكن
-- ============================================================
create or replace function exhibitions.employee_recent_sales(p_token uuid)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v uuid;
begin
  v := exhibitions._employee_from_token(p_token);
  return (select coalesce(json_agg(s),'[]') from (
    select sa.id as sale_id, sa.created_at, sa.total_sar as total, sa.status,
      (select coalesce(json_agg(json_build_object('sale_item_id',si.id,'product_id',si.product_id,
         'name',pr.name,'qty',si.qty,'unit_price',si.unit_sale_price_sar)),'[]')
       from exhibitions.sale_items si join exhibitions.products pr on pr.id=si.product_id
       where si.sale_id=sa.id) as items
    from exhibitions.sales sa
    where sa.employee_id=v and sa.created_at > now() - interval '14 days'
    order by sa.created_at desc limit 50
  ) s);
end $$;
grant execute on function exhibitions.employee_recent_sales(uuid) to anon, authenticated;
