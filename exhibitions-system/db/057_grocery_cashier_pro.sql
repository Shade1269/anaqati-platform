-- ============================================================
-- كاشير البقالة الاحترافي الكامل | Migration 057
-- يضيف: وردية+تقرير Z للبقالة، دفع مقسّم، خصومات (سطر/فاتورة)، ولاء،
-- مرتجعات على الكاشير، تعليق/استئناف الفاتورة، وأصناف موزونة بباركود ميزان.
-- مبدأ محاسبي: مبيعات الكاشير تُرحّل يدويًا (نقد/شبكة فعلية) عبر gl_handled،
-- فيتخطّاها مُحفّز sale_items (الذي يرحّل لعُهدة الموظف 1200 — للبيع بالعُهدة).
-- ============================================================

-- 1) أعمدة جديدة
alter table exhibitions.sales
  add column if not exists shift_id    uuid references exhibitions.cashier_shifts(id) on delete set null,
  add column if not exists customer_id uuid references exhibitions.customers(id) on delete set null,
  add column if not exists discount_sar numeric(14,2) not null default 0,
  add column if not exists paid_cash   numeric(14,2) not null default 0,
  add column if not exists paid_card   numeric(14,2) not null default 0,
  add column if not exists gl_handled  boolean not null default false;
alter table exhibitions.sale_items add column if not exists discount_sar numeric(14,2) not null default 0;
alter table exhibitions.sale_returns add column if not exists gl_handled boolean not null default false;
alter table exhibitions.products
  add column if not exists is_weighed boolean not null default false,
  add column if not exists plu_code text;

-- 2) تعديل مُحفّزات المحاسبة لتخطّي المبيعات المُرحّلة يدويًا (gl_handled)
create or replace function exhibitions._post_sale_item() returns trigger
language plpgsql security definer set search_path=exhibitions,public as $$
declare v_rev numeric; v_cogs numeric; v_date date; v_handled boolean;
begin
  select created_at::date, coalesce(gl_handled,false) into v_date, v_handled from exhibitions.sales where id=NEW.sale_id;
  if v_handled then return NEW; end if;  -- رُحّلت يدويًا في pos_sale
  v_rev := NEW.qty * NEW.unit_sale_price_sar;
  v_cogs := NEW.qty * NEW.unit_cost_snapshot_sar;
  perform exhibitions._post(v_date,'بيع','sale_items',NEW.id,
    jsonb_build_array(
      jsonb_build_object('account','1200','debit',v_rev,'credit',0),
      jsonb_build_object('account','4010','debit',0,'credit',v_rev),
      jsonb_build_object('account','5010','debit',v_cogs,'credit',0),
      jsonb_build_object('account','1100','debit',0,'credit',v_cogs)));
  return NEW;
end $$;

create or replace function exhibitions._post_sale_return_item() returns trigger
language plpgsql security definer set search_path=exhibitions,public as $$
declare v_rev numeric; v_cogs numeric; v_date date; v_si exhibitions.sale_items; v_handled boolean;
begin
  select coalesce(gl_handled,false) into v_handled from exhibitions.sale_returns where id=NEW.return_id;
  if v_handled then return NEW; end if;  -- رُحّل يدويًا في pos_return
  select * into v_si from exhibitions.sale_items where id=NEW.sale_item_id;
  v_rev := NEW.qty * v_si.unit_sale_price_sar;
  v_cogs := NEW.qty * v_si.unit_cost_snapshot_sar;
  select created_at::date into v_date from exhibitions.sale_returns where id=NEW.return_id;
  perform exhibitions._post(v_date,'إرجاع زبون','sale_return_items',NEW.id,
    jsonb_build_array(
      jsonb_build_object('account','4010','debit',v_rev,'credit',0),
      jsonb_build_object('account','1200','debit',0,'credit',v_rev),
      jsonb_build_object('account','1100','debit',v_cogs,'credit',0),
      jsonb_build_object('account','5010','debit',0,'credit',v_cogs)));
  return NEW;
end $$;

-- ============================================================
-- 3) وردية كاشير البقالة (تجمع من sales) + تقرير Z
-- ============================================================
create or replace function exhibitions._gpos_tenant() returns uuid
language plpgsql stable security definer set search_path=exhibitions,public as $$
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_manage_store')) then raise exception 'غير مصرّح'; end if;
  return exhibitions.current_tenant_id();
end $$;
revoke execute on function exhibitions._gpos_tenant() from public, anon, authenticated;

create or replace function exhibitions._gshift_z(p_shift_id uuid, p_tenant uuid)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare sh exhibitions.cashier_shifts; v_agg record; v_expected numeric;
begin
  select * into sh from exhibitions.cashier_shifts where id=p_shift_id and tenant_id=p_tenant;
  if not found then raise exception 'الوردية غير موجودة'; end if;
  select count(*) as bills,
    coalesce(sum(total_sar),0) as sales,
    coalesce(sum(paid_cash),0) as cash_sales,
    coalesce(sum(paid_card),0) as card_sales,
    coalesce(sum(discount_sar),0) as discounts
  into v_agg from exhibitions.sales where shift_id=p_shift_id;
  v_expected := coalesce(sh.opening_float,0) + v_agg.cash_sales;
  return json_build_object(
    'id',sh.id,'status',sh.status,'opened_at',sh.opened_at,'closed_at',sh.closed_at,
    'opening_float',sh.opening_float,
    'opened_by',(select full_name from exhibitions.profiles where id=sh.opened_by),
    'closed_by',(select full_name from exhibitions.profiles where id=sh.closed_by),
    'bills',v_agg.bills,'sales',v_agg.sales,'cash_sales',v_agg.cash_sales,'card_sales',v_agg.card_sales,
    'discounts',v_agg.discounts,
    'expected_cash',v_expected,'declared_cash',sh.declared_cash,
    'variance',case when sh.declared_cash is null then null else sh.declared_cash - v_expected end,
    'note',sh.note);
end $$;

create or replace function exhibitions.gpos_shift_open(p_opening_float numeric default 0)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._gpos_tenant(); v_id uuid;
begin
  select id into v_id from exhibitions.cashier_shifts where tenant_id=v_t and status='open' limit 1;
  if v_id is not null then return exhibitions._gshift_z(v_id, v_t); end if;
  insert into exhibitions.cashier_shifts(tenant_id,opened_by,opening_float,status)
    values(v_t,exhibitions.current_profile_id(),greatest(coalesce(p_opening_float,0),0),'open') returning id into v_id;
  return exhibitions._gshift_z(v_id, v_t);
end $$;

create or replace function exhibitions.gpos_shift_current()
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._gpos_tenant(); v_id uuid;
begin
  select id into v_id from exhibitions.cashier_shifts where tenant_id=v_t and status='open' limit 1;
  if v_id is null then return null; end if;
  return exhibitions._gshift_z(v_id, v_t);
end $$;

create or replace function exhibitions.gpos_shift_close(p_declared_cash numeric, p_note text default null)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._gpos_tenant(); v_id uuid;
begin
  select id into v_id from exhibitions.cashier_shifts where tenant_id=v_t and status='open' limit 1;
  if v_id is null then raise exception 'لا توجد وردية مفتوحة'; end if;
  update exhibitions.cashier_shifts set status='closed', closed_by=exhibitions.current_profile_id(),
    closed_at=now(), declared_cash=greatest(coalesce(p_declared_cash,0),0), note=nullif(p_note,'') where id=v_id;
  return exhibitions._gshift_z(v_id, v_t);
end $$;

-- ============================================================
-- 4) بحث الكاشير + تفكيك باركود الميزان (EAN-13 بوزن/سعر مضمّن، بادئة 2)
--    تنسيق شائع: 2 + PLU(5) + value(5) + check(1) ؛ value = سعر بالقروش أو وزن بالغرام.
-- ============================================================
create or replace function exhibitions.pos_lookup(p_code text)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid; v_code text := trim(p_code); v_row record; v_plu text; v_val numeric; v_price numeric; v_qty numeric;
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_manage_store')) then raise exception 'غير مصرّح'; end if;
  v_t := exhibitions.current_tenant_id();

  -- باركود ميزان: 13 رقمًا يبدأ بـ 2
  if v_code ~ '^2[0-9]{12}$' then
    v_plu := substr(v_code,2,5);
    v_val := substr(v_code,7,5)::numeric;  -- القيمة المضمّنة
    select p.id, p.name, p.product_code, p.base_unit, p.sale_price_ref, p.is_weighed, p.plu_code
      into v_row from exhibitions.products p
      where p.tenant_id=v_t and p.is_active and (p.plu_code=v_plu or p.product_code=v_plu) limit 1;
    if v_row.id is not null then
      -- نفترض القيمة = السعر بالقروش (٪100) ⇒ الكمية = السعر/سعر الكيلو
      v_price := v_val/100.0;
      v_qty := case when coalesce(v_row.sale_price_ref,0)>0 then round(v_price/v_row.sale_price_ref,3) else 1 end;
      return json_build_object('id',v_row.id,'name',v_row.name,'product_code',v_row.product_code,
        'base_unit',v_row.base_unit,'sale_price_ref',v_row.sale_price_ref,'uom_id',null,'factor',1,
        'is_weighed',true,'weighed_qty',v_qty,'embedded_price',v_price);
    end if;
  end if;

  -- مطابقة كود المنتج
  select p.id, p.name, p.product_code, p.base_unit, p.sale_price_ref, p.is_weighed
    into v_row from exhibitions.products p
    where p.tenant_id=v_t and p.is_active and p.product_code=v_code limit 1;
  if v_row.id is null then
    -- باركود وحدة قياس
    select p.id, p.name, p.product_code, p.base_unit, round(p.sale_price_ref*u.factor,2) as sale_price_ref, p.is_weighed
      into v_row from exhibitions.product_uoms u join exhibitions.products p on p.id=u.product_id
      where u.tenant_id=v_t and p.is_active and u.barcode=v_code limit 1;
    if v_row.id is not null then
      return json_build_object('id',v_row.id,'name',v_row.name,'product_code',v_row.product_code,
        'base_unit',v_row.base_unit,'sale_price_ref',v_row.sale_price_ref,
        'uom_id',(select id from exhibitions.product_uoms where product_id=v_row.id and barcode=v_code limit 1),
        'factor',(select factor from exhibitions.product_uoms where product_id=v_row.id and barcode=v_code limit 1),
        'is_weighed',false);
    end if;
  end if;
  if v_row.id is null then return null; end if;
  return json_build_object('id',v_row.id,'name',v_row.name,'product_code',v_row.product_code,
    'base_unit',v_row.base_unit,'sale_price_ref',v_row.sale_price_ref,'uom_id',null,'factor',1,
    'is_weighed',coalesce(v_row.is_weighed,false));
end $$;

-- ============================================================
-- 5) بيع الكاشير الكامل: دفع مقسّم + خصومات + ولاء + وردية
--    items:   [{product_id, qty, unit_price, uom_id?, line_discount?}]
--    payments:[{method:'cash'|'card', amount}]
-- ============================================================
drop function if exists exhibitions.pos_sale(uuid, text, jsonb);
create or replace function exhibitions.pos_sale(
  p_branch_id uuid, p_items jsonb, p_payments jsonb,
  p_invoice_discount numeric default 0, p_customer_id uuid default null, p_redeem_points int default 0)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid; v_actor uuid; v_sale uuid; r jsonb; v_pid uuid; v_qty numeric; v_price numeric; v_uom uuid;
        v_factor numeric; v_base numeric; v_cost numeric; v_ldisc numeric; v_line_net numeric;
        v_items_net numeric:=0; v_cogs numeric:=0; v_inv_disc numeric; v_redeem numeric:=0;
        v_net numeric; v_card numeric:=0; v_cash numeric; v_shift uuid; v_pts int;
        v_en boolean; v_earn numeric; v_redeem_val numeric; v_cust_pts int;
        v_lines jsonb := '[]'::jsonb;
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_manage_store')) then raise exception 'غير مصرّح'; end if;
  v_t := exhibitions.current_tenant_id(); v_actor := exhibitions.current_profile_id();
  if not exists(select 1 from exhibitions.branches where id=p_branch_id and tenant_id=v_t) then raise exception 'الفرع غير موجود'; end if;
  select id into v_shift from exhibitions.cashier_shifts where tenant_id=v_t and status='open' limit 1;

  insert into exhibitions.sales(branch_id,employee_id,payment_method,total_sar,status,shift_id,customer_id,gl_handled)
    values(p_branch_id,v_actor,'cash',0,'completed',v_shift,p_customer_id,true) returning id into v_sale;

  for r in select * from jsonb_array_elements(p_items) loop
    v_pid:=(r->>'product_id')::uuid; v_qty:=(r->>'qty')::numeric; v_price:=(r->>'unit_price')::numeric;
    v_uom:=nullif(r->>'uom_id','')::uuid; v_ldisc:=greatest(coalesce((r->>'line_discount')::numeric,0),0);
    if not exists(select 1 from exhibitions.products where id=v_pid and tenant_id=v_t) then raise exception 'منتج غير صحيح'; end if;
    if v_qty is null or v_qty<=0 then raise exception 'كمية غير صحيحة'; end if;
    if v_uom is not null then select factor into v_factor from exhibitions.product_uoms where id=v_uom and product_id=v_pid and tenant_id=v_t;
      if v_factor is null then v_factor:=1; end if; else v_factor:=1; end if;
    v_base := v_qty*v_factor;
    v_line_net := (v_qty*v_price) - v_ldisc;
    if v_line_net < 0 then v_line_net:=0; end if;
    select cost_price_sar into v_cost from exhibitions.products where id=v_pid;
    insert into exhibitions.sale_items(sale_id,product_id,qty,unit_sale_price_sar,unit_cost_snapshot_sar,discount_sar)
      values(v_sale,v_pid,v_base, round(v_line_net/nullif(v_base,0),4), coalesce(v_cost,0), v_ldisc);
    perform exhibitions._move_stock(v_pid,v_base,'branch',p_branch_id,null,null,'sale','sales',v_sale,v_actor);
    perform exhibitions._consume_fefo(v_pid,'branch',p_branch_id,v_base);
    v_items_net := v_items_net + v_line_net;
    v_cogs := v_cogs + (v_base*coalesce(v_cost,0));
  end loop;

  v_inv_disc := greatest(coalesce(p_invoice_discount,0),0);

  -- ولاء: استبدال نقاط كخصم
  if p_customer_id is not null and coalesce(p_redeem_points,0)>0 then
    select loyalty_enabled, coalesce(loyalty_redeem_value,0) into v_en, v_redeem_val from exhibitions.tenants where id=v_t;
    select points into v_cust_pts from exhibitions.customers where id=p_customer_id and tenant_id=v_t;
    if coalesce(v_en,false) and v_redeem_val>0 and coalesce(v_cust_pts,0) >= p_redeem_points then
      v_redeem := least(p_redeem_points*v_redeem_val, v_items_net - v_inv_disc);
      if v_redeem < 0 then v_redeem:=0; end if;
    end if;
  end if;

  v_net := v_items_net - v_inv_disc - v_redeem;
  if v_net < 0 then v_net := 0; end if;

  -- توزيع الدفع (شبكة بقيمتها، النقد الباقي)
  select coalesce(sum((p->>'amount')::numeric),0) into v_card from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb)) p
    where p->>'method'='card';
  if v_card > v_net then v_card := v_net; end if;
  v_cash := v_net - v_card;

  update exhibitions.sales set total_sar=v_net, discount_sar=v_inv_disc+v_redeem, paid_cash=v_cash, paid_card=v_card where id=v_sale;

  -- القيد المحاسبي اليدوي: نقد/شبكة مدين، إيراد دائن + تكلفة المبيعات
  perform exhibitions._post(current_date,'بيع كاشير','sales',v_sale,
    (case when v_cash>0 then jsonb_build_array(jsonb_build_object('account','1010','debit',v_cash,'credit',0)) else '[]'::jsonb end
     || case when v_card>0 then jsonb_build_array(jsonb_build_object('account','1020','debit',v_card,'credit',0)) else '[]'::jsonb end
     || jsonb_build_array(jsonb_build_object('account','4010','debit',0,'credit',v_net))
     || (case when v_cogs>0 then jsonb_build_array(
           jsonb_build_object('account','5010','debit',v_cogs,'credit',0),
           jsonb_build_object('account','1100','debit',0,'credit',v_cogs)) else '[]'::jsonb end)));

  -- ولاء: كسب النقاط + خصم المُستبدل
  if p_customer_id is not null then
    select loyalty_enabled, coalesce(loyalty_earn_rate,0) into v_en, v_earn from exhibitions.tenants where id=v_t;
    if coalesce(v_en,false) then
      v_pts := floor(v_net * v_earn)::int;
      update exhibitions.customers set points = greatest(points - coalesce(p_redeem_points,0),0) + coalesce(v_pts,0)
        where id=p_customer_id and tenant_id=v_t;
    end if;
  end if;

  return json_build_object('sale_id',v_sale,'total',v_net,'cash',v_cash,'card',v_card,'discount',v_inv_disc+v_redeem,'shift_id',v_shift);
end $$;

-- ============================================================
-- 6) مرتجع على الكاشير (إرجاع للمخزون + قيد عكسي يدوي)
--    items: [{sale_item_id, qty}]  (qty بالوحدة الأساس)
-- ============================================================
create or replace function exhibitions.pos_return(p_sale_id uuid, p_items jsonb, p_refund_method text default 'cash')
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid; v_actor uuid; v_branch uuid; v_ret uuid; r jsonb; v_si exhibitions.sale_items; v_qty numeric;
        v_refund numeric:=0; v_cogs numeric:=0; v_cash text;
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_manage_store')) then raise exception 'غير مصرّح'; end if;
  v_t := exhibitions.current_tenant_id(); v_actor := exhibitions.current_profile_id();
  select branch_id into v_branch from exhibitions.sales s join exhibitions.branches b on b.id=s.branch_id
    where s.id=p_sale_id and b.tenant_id=v_t;
  if v_branch is null then raise exception 'الفاتورة غير موجودة'; end if;
  insert into exhibitions.sale_returns(sale_id,branch_id,employee_id,refund_amount_sar,refund_method,gl_handled)
    values(p_sale_id,v_branch,v_actor,0,nullif(p_refund_method,'')::exhibitions.payment_method,true) returning id into v_ret;
  for r in select * from jsonb_array_elements(p_items) loop
    v_qty:=(r->>'qty')::numeric;
    select * into v_si from exhibitions.sale_items where id=(r->>'sale_item_id')::uuid and sale_id=p_sale_id;
    if v_si.id is null then raise exception 'بند غير صحيح'; end if;
    if v_qty is null or v_qty<=0 or v_qty>v_si.qty then raise exception 'كمية إرجاع غير صحيحة'; end if;
    insert into exhibitions.sale_return_items(return_id,sale_item_id,qty) values(v_ret,v_si.id,v_qty);
    perform exhibitions._move_stock(v_si.product_id,v_qty,null,null,'branch',v_branch,'customer_return','sale_returns',v_ret,v_actor);
    v_refund := v_refund + (v_qty*v_si.unit_sale_price_sar);
    v_cogs := v_cogs + (v_qty*v_si.unit_cost_snapshot_sar);
  end loop;
  update exhibitions.sale_returns set refund_amount_sar=v_refund where id=v_ret;
  v_cash := case when p_refund_method='card' then '1020' else '1010' end;
  perform exhibitions._post(current_date,'مرتجع كاشير','sale_returns',v_ret,
    jsonb_build_array(
      jsonb_build_object('account','4010','debit',v_refund,'credit',0),
      jsonb_build_object('account',v_cash,'debit',0,'credit',v_refund),
      jsonb_build_object('account','1100','debit',v_cogs,'credit',0),
      jsonb_build_object('account','5010','debit',0,'credit',v_cogs)));
  return json_build_object('return_id',v_ret,'refund',v_refund);
end $$;

-- بحث فاتورة للمرتجع
create or replace function exhibitions.pos_sale_lookup(p_sale_id uuid)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._gpos_tenant();
begin
  return (select json_build_object(
    'sale',(select row_to_json(o) from (select s.id, s.total_sar, s.created_at from exhibitions.sales s
       join exhibitions.branches b on b.id=s.branch_id where s.id=p_sale_id and b.tenant_id=v_t) o),
    'items',(select coalesce(json_agg(row_to_json(it)),'[]') from (
       select si.id, si.product_id, p.name as product_name, si.qty, si.unit_sale_price_sar,
         coalesce((select sum(ri.qty) from exhibitions.sale_return_items ri where ri.sale_item_id=si.id),0) as returned
       from exhibitions.sale_items si join exhibitions.products p on p.id=si.product_id
       where si.sale_id=p_sale_id) it)
  ));
end $$;

-- ============================================================
-- 7) تعليق/استئناف الفاتورة (Park/Hold)
-- ============================================================
create table if not exists exhibitions.held_sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references exhibitions.tenants(id) on delete cascade,
  branch_id uuid, label text, cart jsonb not null,
  created_by uuid references exhibitions.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
do $$ begin
  execute 'drop trigger if exists trg_set_tenant on exhibitions.held_sales';
  execute 'create trigger trg_set_tenant before insert on exhibitions.held_sales for each row execute function exhibitions._set_tenant()';
  execute 'alter table exhibitions.held_sales enable row level security';
  execute 'drop policy if exists admin_all on exhibitions.held_sales';
  execute 'create policy admin_all on exhibitions.held_sales for all to authenticated using (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id())';
  execute 'drop policy if exists mgr_held on exhibitions.held_sales';
  execute 'create policy mgr_held on exhibitions.held_sales for all to authenticated using (exhibitions._im_can(''can_manage_store'') and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions._im_can(''can_manage_store'') and tenant_id=exhibitions.current_tenant_id())';
  execute 'grant select,insert,update,delete on exhibitions.held_sales to authenticated';
  execute 'grant all on exhibitions.held_sales to service_role';
end $$;

create or replace function exhibitions.pos_hold(p_branch_id uuid, p_label text, p_cart jsonb)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._gpos_tenant(); v_id uuid;
begin
  insert into exhibitions.held_sales(tenant_id,branch_id,label,cart,created_by)
    values(v_t,p_branch_id,nullif(trim(p_label),''),coalesce(p_cart,'[]'::jsonb),exhibitions.current_profile_id()) returning id into v_id;
  return v_id;
end $$;

create or replace function exhibitions.pos_held_list()
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._gpos_tenant();
begin
  return (select coalesce(json_agg(row_to_json(x) order by x.created_at desc),'[]') from (
    select id, label, cart, created_at from exhibitions.held_sales where tenant_id=v_t) x);
end $$;

create or replace function exhibitions.pos_held_delete(p_id uuid)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._gpos_tenant();
begin
  delete from exhibitions.held_sales where id=p_id and tenant_id=v_t;
end $$;

-- ============================================================
-- 8) تقارير الكاشير بالساعة (لليوم) — للمالك
-- ============================================================
create or replace function exhibitions.pos_sales_by_hour(p_date date default null)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid; v_d date := coalesce(p_date, (now() at time zone 'Asia/Damascus')::date);
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  v_t := exhibitions.current_tenant_id();
  return (select coalesce(json_agg(row_to_json(x) order by x.hour),'[]') from (
    select extract(hour from (s.created_at at time zone 'Asia/Damascus'))::int as hour,
           count(*) as bills, coalesce(sum(s.total_sar),0) as sales
    from exhibitions.sales s join exhibitions.branches b on b.id=s.branch_id
    where b.tenant_id=v_t and (s.created_at at time zone 'Asia/Damascus')::date = v_d
    group by 1) x);
end $$;

grant execute on function exhibitions.gpos_shift_open(numeric) to authenticated;
grant execute on function exhibitions.gpos_shift_current() to authenticated;
grant execute on function exhibitions.gpos_shift_close(numeric, text) to authenticated;
grant execute on function exhibitions.pos_lookup(text) to authenticated;
grant execute on function exhibitions.pos_sale(uuid, jsonb, jsonb, numeric, uuid, int) to authenticated;
grant execute on function exhibitions.pos_return(uuid, jsonb, text) to authenticated;
grant execute on function exhibitions.pos_sale_lookup(uuid) to authenticated;
grant execute on function exhibitions.pos_hold(uuid, text, jsonb) to authenticated;
grant execute on function exhibitions.pos_held_list() to authenticated;
grant execute on function exhibitions.pos_held_delete(uuid) to authenticated;
grant execute on function exhibitions.pos_sales_by_hour(date) to authenticated;
