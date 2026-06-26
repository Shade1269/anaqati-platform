-- ============================================================
-- تقارير المطعم | Migration 031
-- ملخص + الأكثر مبيعًا + حسب التصنيف + المبيعات بالساعة + أداء الموظفين.
-- للمالك أو مدير بصلاحية can_manage_restaurant فقط.
-- ============================================================
create or replace function exhibitions.restaurant_report(p_from date, p_to date)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
declare v_tenant uuid; v_to timestamptz; v_from timestamptz;
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_manage_restaurant')) then raise exception 'غير مصرّح'; end if;
  v_tenant := exhibitions.current_tenant_id();
  v_from := p_from::timestamptz;
  v_to := (p_to + 1)::timestamptz;
  return json_build_object(
    'summary', (select json_build_object(
        'bills', count(*),
        'sales', coalesce(sum(amt),0),
        'avg_ticket', case when count(*)>0 then round(coalesce(sum(amt),0)/count(*),2) else 0 end,
        'dine_in', coalesce(sum(case when order_type='dine_in' then amt else 0 end),0),
        'takeaway', coalesce(sum(case when order_type='takeaway' then amt else 0 end),0),
        'delivery', coalesce(sum(case when order_type='delivery' then amt else 0 end),0),
        'cash', coalesce(sum(case when payment_method='cash' then amt else 0 end),0),
        'card', coalesce(sum(case when payment_method='card' then amt else 0 end),0),
        'discounts', coalesce(sum(discount_amount),0),
        'service', coalesce(sum(service_amount),0),
        'tax', coalesce(sum(tax_amount),0),
        'tips', coalesce(sum(tip_amount),0))
      from (select *, coalesce(nullif(grand_total,0), total_sar+coalesce(delivery_fee,0)) amt
            from exhibitions.table_sessions
            where tenant_id=v_tenant and status='paid' and closed_at>=v_from and closed_at<v_to) q),
    'cogs', (select coalesce(sum(l.debit),0) from exhibitions.journal_lines l
              join exhibitions.journal_entries j on j.id=l.entry_id
              where j.tenant_id=v_tenant and j.source_table='table_sessions' and l.account_code='5010'
                and j.entry_date>=p_from and j.entry_date<=p_to),
    'top_items', (select coalesce(json_agg(x),'[]') from (
        select oi.name_snapshot as name, sum(oi.qty)::int as qty, sum(oi.line_total_sar) as revenue
        from exhibitions.order_items oi
        join exhibitions.orders o on o.id=oi.order_id
        join exhibitions.table_sessions ts on ts.id=o.session_id
        where ts.tenant_id=v_tenant and ts.status='paid' and ts.closed_at>=v_from and ts.closed_at<v_to and o.status<>'cancelled'
        group by oi.name_snapshot order by qty desc limit 15) x),
    'by_category', (select coalesce(json_agg(x),'[]') from (
        select coalesce(mc.name,'بدون تصنيف') as name, sum(oi.qty)::int as qty, sum(oi.line_total_sar) as revenue
        from exhibitions.order_items oi
        join exhibitions.orders o on o.id=oi.order_id
        join exhibitions.table_sessions ts on ts.id=o.session_id
        left join exhibitions.menu_items mi on mi.id=oi.menu_item_id
        left join exhibitions.menu_categories mc on mc.id=mi.category_id
        where ts.tenant_id=v_tenant and ts.status='paid' and ts.closed_at>=v_from and ts.closed_at<v_to and o.status<>'cancelled'
        group by coalesce(mc.name,'بدون تصنيف') order by revenue desc) x),
    'by_hour', (select coalesce(json_agg(x order by (x->>'hour')::int),'[]') from (
        select json_build_object('hour',extract(hour from closed_at)::int,'bills',count(*),
          'sales',sum(coalesce(nullif(grand_total,0),total_sar+coalesce(delivery_fee,0)))) as x
        from exhibitions.table_sessions
        where tenant_id=v_tenant and status='paid' and closed_at>=v_from and closed_at<v_to
        group by extract(hour from closed_at)::int) x),
    'staff', (select coalesce(json_agg(x),'[]') from (
        select coalesce(pr.full_name,'—') as name, count(*)::int as bills,
          sum(coalesce(nullif(ts.grand_total,0),ts.total_sar+coalesce(ts.delivery_fee,0))) as sales
        from exhibitions.table_sessions ts
        left join exhibitions.profiles pr on pr.id=coalesce(ts.closed_by, ts.opened_by)
        where ts.tenant_id=v_tenant and ts.status='paid' and ts.closed_at>=v_from and ts.closed_at<v_to
        group by coalesce(pr.full_name,'—') order by sales desc) x)
  );
end $function$;

grant execute on function exhibitions.restaurant_report(date,date) to authenticated;
