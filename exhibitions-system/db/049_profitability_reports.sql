-- ============================================================
-- تقارير الربحية لكل صنف/فرع/موظف/عميل | Migration 049
-- الفجوة #7 من بحث الأنظمة العالمية (NetSuite/SAP B1/Daftra).
-- يستفيد من لقطة التكلفة (unit_cost_snapshot_sar) المخزَّنة وقت البيع:
--   ربح الصنف = الإيراد − التكلفة، صافٍ بعد المرتجعات.
-- التجزئة (sale_items) تحمل لقطة تكلفة دقيقة؛ الجملة تُقدَّر بتكلفة المنتج.
-- حساسة (تكشف التكلفة والربح) ⇒ للأدمن فقط.
-- ============================================================

create or replace function exhibitions._profit_range(p_from date, p_to date)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_from date := coalesce(p_from, date_trunc('month', current_date)::date);
        v_to date := coalesce(p_to, current_date);
begin
  return json_build_object('from', v_from, 'to', v_to);
end $$;
revoke execute on function exhibitions._profit_range(date,date) from public, anon, authenticated;

-- ربحية الأصناف (تجزئة، صافٍ بعد المرتجعات)
create or replace function exhibitions.profit_by_product(p_from date default null, p_to date default null)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid; v_from date := coalesce(p_from, date_trunc('month', current_date)::date); v_to date := coalesce(p_to, current_date);
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  v_t := exhibitions.current_tenant_id();
  return (
    with s as (
      select si.product_id,
             sum(si.qty) as qty,
             sum(si.qty*si.unit_sale_price_sar) as rev,
             sum(si.qty*si.unit_cost_snapshot_sar) as cost
      from exhibitions.sale_items si
      join exhibitions.sales sa on sa.id=si.sale_id
      join exhibitions.branches b on b.id=sa.branch_id
      where b.tenant_id=v_t and sa.created_at::date between v_from and v_to
      group by si.product_id
    ),
    r as (
      select si.product_id,
             sum(ri.qty) as qty,
             sum(ri.qty*si.unit_sale_price_sar) as rev,
             sum(ri.qty*si.unit_cost_snapshot_sar) as cost
      from exhibitions.sale_return_items ri
      join exhibitions.sale_returns sr on sr.id=ri.return_id
      join exhibitions.sale_items si on si.id=ri.sale_item_id
      join exhibitions.branches b on b.id=sr.branch_id
      where b.tenant_id=v_t and sr.created_at::date between v_from and v_to
      group by si.product_id
    )
    select coalesce(json_agg(row_to_json(x) order by x.profit desc),'[]') from (
      select p.id, p.name, p.product_code,
             (s.qty - coalesce(r.qty,0)) as qty,
             round(s.rev - coalesce(r.rev,0),2) as revenue,
             round(s.cost - coalesce(r.cost,0),2) as cost,
             round((s.rev - coalesce(r.rev,0)) - (s.cost - coalesce(r.cost,0)),2) as profit,
             case when (s.rev - coalesce(r.rev,0)) > 0
                  then round(((s.rev - coalesce(r.rev,0)) - (s.cost - coalesce(r.cost,0))) / (s.rev - coalesce(r.rev,0)) * 100, 1)
                  else 0 end as margin_pct
      from s
      join exhibitions.products p on p.id=s.product_id
      left join r on r.product_id=s.product_id
    ) x
  );
end $$;

-- ربحية الفروع/المعارض
create or replace function exhibitions.profit_by_branch(p_from date default null, p_to date default null)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid; v_from date := coalesce(p_from, date_trunc('month', current_date)::date); v_to date := coalesce(p_to, current_date);
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  v_t := exhibitions.current_tenant_id();
  return (
    with s as (
      select sa.branch_id,
             sum(si.qty*si.unit_sale_price_sar) as rev,
             sum(si.qty*si.unit_cost_snapshot_sar) as cost
      from exhibitions.sale_items si
      join exhibitions.sales sa on sa.id=si.sale_id
      join exhibitions.branches b on b.id=sa.branch_id
      where b.tenant_id=v_t and sa.created_at::date between v_from and v_to
      group by sa.branch_id
    ),
    r as (
      select sr.branch_id,
             sum(ri.qty*si.unit_sale_price_sar) as rev,
             sum(ri.qty*si.unit_cost_snapshot_sar) as cost
      from exhibitions.sale_return_items ri
      join exhibitions.sale_returns sr on sr.id=ri.return_id
      join exhibitions.sale_items si on si.id=ri.sale_item_id
      join exhibitions.branches b on b.id=sr.branch_id
      where b.tenant_id=v_t and sr.created_at::date between v_from and v_to
      group by sr.branch_id
    )
    select coalesce(json_agg(row_to_json(x) order by x.profit desc),'[]') from (
      select b.id, b.name,
             round(coalesce(s.rev,0) - coalesce(r.rev,0),2) as revenue,
             round(coalesce(s.cost,0) - coalesce(r.cost,0),2) as cost,
             round((coalesce(s.rev,0) - coalesce(r.rev,0)) - (coalesce(s.cost,0) - coalesce(r.cost,0)),2) as profit,
             case when (coalesce(s.rev,0) - coalesce(r.rev,0)) > 0
                  then round(((coalesce(s.rev,0) - coalesce(r.rev,0)) - (coalesce(s.cost,0) - coalesce(r.cost,0))) / (coalesce(s.rev,0) - coalesce(r.rev,0)) * 100, 1)
                  else 0 end as margin_pct
      from exhibitions.branches b
      join s on s.branch_id=b.id
      left join r on r.branch_id=b.id
      where b.tenant_id=v_t
    ) x
  );
end $$;

-- ربحية الموظفين (البائعين)
create or replace function exhibitions.profit_by_employee(p_from date default null, p_to date default null)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid; v_from date := coalesce(p_from, date_trunc('month', current_date)::date); v_to date := coalesce(p_to, current_date);
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  v_t := exhibitions.current_tenant_id();
  return (
    with s as (
      select sa.employee_id,
             sum(si.qty*si.unit_sale_price_sar) as rev,
             sum(si.qty*si.unit_cost_snapshot_sar) as cost
      from exhibitions.sale_items si
      join exhibitions.sales sa on sa.id=si.sale_id
      join exhibitions.branches b on b.id=sa.branch_id
      where b.tenant_id=v_t and sa.created_at::date between v_from and v_to and sa.employee_id is not null
      group by sa.employee_id
    )
    select coalesce(json_agg(row_to_json(x) order by x.profit desc),'[]') from (
      select pr.id, pr.full_name as name,
             round(s.rev,2) as revenue, round(s.cost,2) as cost,
             round(s.rev - s.cost,2) as profit,
             case when s.rev>0 then round((s.rev - s.cost)/s.rev*100,1) else 0 end as margin_pct
      from s join exhibitions.profiles pr on pr.id=s.employee_id
    ) x
  );
end $$;

-- ربحية عملاء الجملة (تُقدَّر التكلفة بتكلفة المنتج الحالية)
create or replace function exhibitions.profit_by_customer(p_from date default null, p_to date default null)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid; v_from date := coalesce(p_from, date_trunc('month', current_date)::date); v_to date := coalesce(p_to, current_date);
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  v_t := exhibitions.current_tenant_id();
  return (
    select coalesce(json_agg(row_to_json(x) order by x.profit desc),'[]') from (
      select coalesce(nullif(trim(o.customer_name),''),'(بدون اسم)') as name,
             round(sum(oi.qty*oi.unit_price_sar),2) as revenue,
             round(sum(coalesce(oi.base_qty, oi.qty) * pr.cost_price_sar),2) as cost,
             round(sum(oi.qty*oi.unit_price_sar) - sum(coalesce(oi.base_qty, oi.qty) * pr.cost_price_sar),2) as profit
      from exhibitions.wholesale_orders o
      join exhibitions.wholesale_order_items oi on oi.order_id=o.id
      join exhibitions.products pr on pr.id=oi.product_id
      where o.tenant_id=v_t and o.created_at::date between v_from and v_to
      group by coalesce(nullif(trim(o.customer_name),''),'(بدون اسم)')
    ) x
  );
end $$;

grant execute on function exhibitions.profit_by_product(date,date) to authenticated;
grant execute on function exhibitions.profit_by_branch(date,date) to authenticated;
grant execute on function exhibitions.profit_by_employee(date,date) to authenticated;
grant execute on function exhibitions.profit_by_customer(date,date) to authenticated;
