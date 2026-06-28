-- ============================================================
-- حد الائتمان + تقادم الذمم (Aging) | Migration 047
-- الفجوة #4 من بحث الأنظمة العالمية (Daftra/NetSuite/SAP B1).
-- مهم للسوق السوري (البيع بالدين شائع):
--   • حدّ ائتمان لكل عميل (0 = بلا حد). يُمنع تجاوزه عند تسجيل دين جديد.
--   • تقرير تقادم الذمم: توزيع الرصيد غير المسدَّد على شرائح عمرية
--     (0-30 / 31-60 / 61-90 / +90) بأسلوب FIFO (التسديد يُطفئ الأقدم أولًا).
-- يُبنى فوق customers / customer_entries (هجرة 023) ويربط قائمة الأسعار (046).
-- ============================================================

alter table exhibitions.customers
  add column if not exists credit_limit numeric(14,2) not null default 0;

-- ============================================================
-- قائمة العملاء (تشمل حد الائتمان وقائمة الأسعار)
-- ============================================================
create or replace function exhibitions.customers_list()
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._cust_tenant();
begin
  return (select coalesce(json_agg(row_to_json(x) order by (x.balance) desc, x.name),'[]') from (
    select c.id,c.name,c.phone,c.note,c.is_active,c.credit_limit,c.price_list_id,
      coalesce((select sum(case when e.kind='charge' then e.amount else -e.amount end) from exhibitions.customer_entries e where e.customer_id=c.id),0) as balance
    from exhibitions.customers c where c.tenant_id=v_t) x);
end $$;

-- ============================================================
-- إنشاء/تعديل عميل (مع حد الائتمان وقائمة الأسعار)
-- إسقاط النسخة القديمة لتفادي التحميل الزائد على التوقيع.
-- ============================================================
drop function if exists exhibitions.customer_set(uuid, text, text, text, boolean);
create or replace function exhibitions.customer_set(
  p_id uuid, p_name text, p_phone text, p_note text,
  p_active boolean default true, p_credit_limit numeric default 0, p_price_list_id uuid default null)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._cust_tenant(); v_id uuid; v_limit numeric := greatest(coalesce(p_credit_limit,0),0);
begin
  if p_price_list_id is not null and not exists(select 1 from exhibitions.price_lists where id=p_price_list_id and tenant_id=v_t) then
    raise exception 'قائمة الأسعار غير موجودة'; end if;
  if p_id is null then
    insert into exhibitions.customers(tenant_id,name,phone,note,is_active,credit_limit,price_list_id)
      values(v_t,p_name,p_phone,p_note,coalesce(p_active,true),v_limit,p_price_list_id) returning id into v_id;
  else
    update exhibitions.customers set name=p_name,phone=p_phone,note=p_note,is_active=coalesce(p_active,true),
        credit_limit=v_limit, price_list_id=p_price_list_id
      where id=p_id and tenant_id=v_t returning id into v_id;
    if v_id is null then raise exception 'العميل غير موجود'; end if;
  end if; return v_id;
end $$;

-- ============================================================
-- تسجيل دين/بيع آجل — مع فرض حد الائتمان
-- ============================================================
create or replace function exhibitions.customer_charge(p_customer_id uuid, p_amount numeric, p_note text default null)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._cust_tenant(); v_actor uuid := exhibitions.current_profile_id(); v_e uuid;
        v_limit numeric; v_balance numeric;
begin
  if coalesce(p_amount,0) <= 0 then raise exception 'المبلغ غير صحيح'; end if;
  select credit_limit into v_limit from exhibitions.customers where id=p_customer_id and tenant_id=v_t;
  if v_limit is null then raise exception 'العميل غير موجود'; end if;
  if v_limit > 0 then
    select coalesce(sum(case when kind='charge' then amount else -amount end),0) into v_balance
      from exhibitions.customer_entries where customer_id=p_customer_id and tenant_id=v_t;
    if v_balance + p_amount > v_limit then
      raise exception 'تجاوز حد الائتمان: الرصيد الحالي % + المبلغ % يتجاوز الحد %', v_balance, p_amount, v_limit;
    end if;
  end if;
  insert into exhibitions.customer_entries(tenant_id,customer_id,kind,amount,note,created_by)
    values(v_t,p_customer_id,'charge',p_amount,p_note,v_actor) returning id into v_e;
  perform exhibitions._post(current_date,'بيع آجل (دين عميل)','customer_entries',v_e,
    jsonb_build_array(jsonb_build_object('account','1300','debit',p_amount,'credit',0),
                      jsonb_build_object('account','4010','debit',0,'credit',p_amount)));
end $$;

-- ============================================================
-- تقادم الذمم (Aged Debtors) — FIFO: التسديد يطفئ الأقدم أولًا
-- ============================================================
create or replace function exhibitions.customers_aging()
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._cust_tenant();
begin
  return (
    with charges as (
      select e.customer_id, e.amount, e.created_at::date as d,
        coalesce(sum(e.amount) over (partition by e.customer_id order by e.created_at, e.id
           rows between unbounded preceding and 1 preceding),0) as prev_cum
      from exhibitions.customer_entries e
      where e.tenant_id=v_t and e.kind='charge'
    ),
    pays as (
      select customer_id, coalesce(sum(amount),0) as paid
      from exhibitions.customer_entries where tenant_id=v_t and kind='payment' group by customer_id
    ),
    unpaid as (
      select ch.customer_id, ch.d,
        ch.amount - greatest(0, least(ch.amount, coalesce(p.paid,0) - ch.prev_cum)) as unpaid_amt
      from charges ch left join pays p on p.customer_id=ch.customer_id
    ),
    agg as (
      select c.id, c.name, c.phone, c.credit_limit,
        round(coalesce(sum(u.unpaid_amt),0),2) as balance,
        round(coalesce(sum(u.unpaid_amt) filter (where current_date - u.d <= 30),0),2) as b0_30,
        round(coalesce(sum(u.unpaid_amt) filter (where current_date - u.d between 31 and 60),0),2) as b31_60,
        round(coalesce(sum(u.unpaid_amt) filter (where current_date - u.d between 61 and 90),0),2) as b61_90,
        round(coalesce(sum(u.unpaid_amt) filter (where current_date - u.d > 90),0),2) as b90_plus
      from exhibitions.customers c
      left join unpaid u on u.customer_id=c.id
      where c.tenant_id=v_t
      group by c.id,c.name,c.phone,c.credit_limit
    )
    select coalesce(json_agg(row_to_json(agg) order by agg.balance desc),'[]')
    from agg where agg.balance > 0
  );
end $$;

grant execute on function exhibitions.customers_list() to authenticated;
grant execute on function exhibitions.customer_set(uuid,text,text,text,boolean,numeric,uuid) to authenticated;
grant execute on function exhibitions.customer_charge(uuid,numeric,text) to authenticated;
grant execute on function exhibitions.customers_aging() to authenticated;
