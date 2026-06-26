-- ============================================================
-- (1) توقيت سوريا لتحليلات المطعم + (2) تقرير التجزئة | Migration 038
-- restaurant_report يجمع الساعات/الأيام/النطاق بتوقيت Asia/Damascus.
-- retail_report: تحليلات مبيعات التجزئة (ملخص/يومي/أصناف/معارض/ساعات/موظفون).
-- (التعريفات الكاملة طُبّقت على القاعدة؛ هذا الملف للمزامنة.)
-- ملاحظة: نسخة restaurant_report بتوقيت سوريا موجودة في 037+هذه؛ retail_report جديد.
-- ============================================================
create or replace function exhibitions.retail_report(p_from date, p_to date)
returns json language plpgsql stable security definer set search_path to 'exhibitions','public' as $function$
declare v_tenant uuid; v_from timestamptz; v_to timestamptz; tz text := 'Asia/Damascus';
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  v_tenant := exhibitions.current_tenant_id();
  v_from := (p_from::timestamp) at time zone tz;
  v_to := ((p_to + 1)::timestamp) at time zone tz;
  return json_build_object(
    'summary', (select json_build_object(
        'bills', count(*), 'sales', coalesce(sum(total_sar),0),
        'avg_ticket', case when count(*)>0 then round(coalesce(sum(total_sar),0)/count(*),2) else 0 end,
        'cash', coalesce(sum(case when payment_method='cash' then total_sar else 0 end),0),
        'card', coalesce(sum(case when payment_method='card' then total_sar else 0 end),0))
      from exhibitions.sales where tenant_id=v_tenant and status='completed' and created_at>=v_from and created_at<v_to),
    'cogs', (select coalesce(sum(si.qty*si.unit_cost_snapshot_sar),0)
        from exhibitions.sale_items si join exhibitions.sales s on s.id=si.sale_id
        where s.tenant_id=v_tenant and s.status='completed' and s.created_at>=v_from and s.created_at<v_to),
    'by_day', (select coalesce(json_agg(x order by (x->>'d')),'[]') from (
        select json_build_object('d',(created_at at time zone tz)::date,'sales',sum(total_sar),'bills',count(*)) as x
        from exhibitions.sales where tenant_id=v_tenant and status='completed' and created_at>=v_from and created_at<v_to
        group by (created_at at time zone tz)::date) x),
    'top_items', (select coalesce(json_agg(x),'[]') from (
        select coalesce(p.name,'—') as name, sum(si.qty)::int as qty, sum(si.qty*si.unit_sale_price_sar) as revenue
        from exhibitions.sale_items si join exhibitions.sales s on s.id=si.sale_id
        left join exhibitions.products p on p.id=si.product_id
        where s.tenant_id=v_tenant and s.status='completed' and s.created_at>=v_from and s.created_at<v_to
        group by coalesce(p.name,'—') order by qty desc limit 15) x),
    'by_branch', (select coalesce(json_agg(x),'[]') from (
        select coalesce(b.name,'—') as name, count(*)::int as bills, sum(s.total_sar) as sales
        from exhibitions.sales s left join exhibitions.branches b on b.id=s.branch_id
        where s.tenant_id=v_tenant and s.status='completed' and s.created_at>=v_from and s.created_at<v_to
        group by coalesce(b.name,'—') order by sales desc) x),
    'by_hour', (select coalesce(json_agg(x order by (x->>'hour')::int),'[]') from (
        select json_build_object('hour',extract(hour from (created_at at time zone tz))::int,'bills',count(*),'sales',sum(total_sar)) as x
        from exhibitions.sales where tenant_id=v_tenant and status='completed' and created_at>=v_from and created_at<v_to
        group by extract(hour from (created_at at time zone tz))::int) x),
    'staff', (select coalesce(json_agg(x),'[]') from (
        select coalesce(pr.full_name,'—') as name, count(*)::int as bills, sum(s.total_sar) as sales
        from exhibitions.sales s left join exhibitions.profiles pr on pr.id=s.employee_id
        where s.tenant_id=v_tenant and s.status='completed' and s.created_at>=v_from and s.created_at<v_to
        group by coalesce(pr.full_name,'—') order by sales desc) x)
  );
end $function$;
grant execute on function exhibitions.retail_report(date,date) to authenticated;
