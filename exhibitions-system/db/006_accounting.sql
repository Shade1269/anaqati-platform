-- ============================================================
-- نظام المعارض — محرّك المحاسبة (قيد مزدوج) | Migration 006
-- دليل حسابات + يومية + أستاذ + قيود تلقائية + تقارير | schema: exhibitions
-- ============================================================

-- ---------- دليل الحسابات ----------
create table if not exists exhibitions.accounts (
  code  text primary key,
  name  text not null,
  type  text not null check (type in ('asset','liability','equity','revenue','expense')),
  is_active boolean not null default true,
  sort  int default 0
);

insert into exhibitions.accounts(code,name,type,sort) values
  ('1010','الصندوق (نقد)','asset',10),
  ('1020','الشبكة / البنك','asset',20),
  ('1100','المخزون','asset',30),
  ('1200','ذمم الموظفين (عُهدة)','asset',40),
  ('1210','سُلف الموظفين','asset',50),
  ('2010','ذمم الموردين','liability',60),
  ('2200','عمولات مستحقة','liability',70),
  ('3010','رأس المال','equity',80),
  ('3020','مسحوبات المالك','equity',90),
  ('3900','أرباح محتجزة','equity',95),
  ('4010','إيرادات المبيعات','revenue',100),
  ('4020','إيرادات الجملة','revenue',110),
  ('5010','تكلفة المبيعات','expense',120),
  ('5100','مصاريف المعارض','expense',130),
  ('5200','الرواتب','expense',140),
  ('5300','العمولات','expense',150),
  ('5400','عجز وفاقد','expense',160)
on conflict (code) do nothing;

-- ---------- اليومية + الأستاذ ----------
create table if not exists exhibitions.journal_entries (
  id           uuid primary key default gen_random_uuid(),
  entry_date   date not null default current_date,
  memo         text,
  source_table text,
  source_id    uuid,
  created_by   uuid references exhibitions.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create table if not exists exhibitions.journal_lines (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references exhibitions.journal_entries(id) on delete cascade,
  account_code text not null references exhibitions.accounts(code),
  debit       numeric(14,2) not null default 0,
  credit      numeric(14,2) not null default 0,
  check (debit >= 0 and credit >= 0)
);
create index if not exists idx_exh_jl_entry on exhibitions.journal_lines(entry_id);
create index if not exists idx_exh_jl_account on exhibitions.journal_lines(account_code);
create index if not exists idx_exh_je_date on exhibitions.journal_entries(entry_date);

-- RLS: محاسبة للأدمن فقط
alter table exhibitions.accounts enable row level security;
alter table exhibitions.journal_entries enable row level security;
alter table exhibitions.journal_lines enable row level security;
do $$ declare t text; begin
  foreach t in array array['accounts','journal_entries','journal_lines'] loop
    execute format('drop policy if exists admin_all on exhibitions.%I', t);
    execute format('create policy admin_all on exhibitions.%I for all to authenticated using (exhibitions.is_admin()) with check (exhibitions.is_admin())', t);
  end loop;
end $$;
grant all on exhibitions.accounts, exhibitions.journal_entries, exhibitions.journal_lines to service_role;
grant select on exhibitions.accounts, exhibitions.journal_entries, exhibitions.journal_lines to authenticated;

-- ---------- دالة الترحيل (تتأكد من التوازن) ----------
create or replace function exhibitions._post(p_date date, p_memo text, p_src text, p_src_id uuid, p_lines jsonb)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_entry uuid; v_dr numeric; v_cr numeric; r jsonb;
begin
  select coalesce(sum((x->>'debit')::numeric),0), coalesce(sum((x->>'credit')::numeric),0)
    into v_dr, v_cr from jsonb_array_elements(p_lines) x;
  if round(coalesce(v_dr,0),2) = 0 and round(coalesce(v_cr,0),2) = 0 then return null; end if;
  if round(v_dr,2) <> round(v_cr,2) then
    raise exception 'قيد غير متوازن: مدين % / دائن %', v_dr, v_cr;
  end if;
  insert into exhibitions.journal_entries(entry_date,memo,source_table,source_id,created_by)
    values(coalesce(p_date,current_date),p_memo,p_src,p_src_id,exhibitions.current_profile_id())
    returning id into v_entry;
  for r in select * from jsonb_array_elements(p_lines) loop
    if coalesce((r->>'debit')::numeric,0) <> 0 or coalesce((r->>'credit')::numeric,0) <> 0 then
      insert into exhibitions.journal_lines(entry_id,account_code,debit,credit)
        values(v_entry,(r->>'account'),coalesce((r->>'debit')::numeric,0),coalesce((r->>'credit')::numeric,0));
    end if;
  end loop;
  return v_entry;
end $$;

-- ---------- قيود تلقائية عبر Triggers ----------

-- استلام بضاعة: مدين المخزون / دائن ذمم الموردين (بالتكلفة)
create or replace function exhibitions._post_receipt_item() returns trigger
language plpgsql security definer set search_path=exhibitions,public as $$
declare v_cost numeric; v_amt numeric; v_date date;
begin
  select cost_price_sar into v_cost from exhibitions.products where id=NEW.product_id;
  v_amt := NEW.qty * coalesce(v_cost,0);
  select created_at::date into v_date from exhibitions.stock_receipts where id=NEW.receipt_id;
  perform exhibitions._post(v_date,'استلام بضاعة','stock_receipt_items',NEW.id,
    jsonb_build_array(
      jsonb_build_object('account','1100','debit',v_amt,'credit',0),
      jsonb_build_object('account','2010','debit',0,'credit',v_amt)));
  return NEW;
end $$;
drop trigger if exists trg_post_receipt_item on exhibitions.stock_receipt_items;
create trigger trg_post_receipt_item after insert on exhibitions.stock_receipt_items
  for each row execute function exhibitions._post_receipt_item();

-- بيع الموظف: مدين ذمم الموظفين / دائن إيراد المبيعات ؛ مدين تكلفة المبيعات / دائن المخزون
create or replace function exhibitions._post_sale_item() returns trigger
language plpgsql security definer set search_path=exhibitions,public as $$
declare v_rev numeric; v_cogs numeric; v_date date;
begin
  v_rev := NEW.qty * NEW.unit_sale_price_sar;
  v_cogs := NEW.qty * NEW.unit_cost_snapshot_sar;
  select created_at::date into v_date from exhibitions.sales where id=NEW.sale_id;
  perform exhibitions._post(v_date,'بيع','sale_items',NEW.id,
    jsonb_build_array(
      jsonb_build_object('account','1200','debit',v_rev,'credit',0),
      jsonb_build_object('account','4010','debit',0,'credit',v_rev),
      jsonb_build_object('account','5010','debit',v_cogs,'credit',0),
      jsonb_build_object('account','1100','debit',0,'credit',v_cogs)));
  return NEW;
end $$;
drop trigger if exists trg_post_sale_item on exhibitions.sale_items;
create trigger trg_post_sale_item after insert on exhibitions.sale_items
  for each row execute function exhibitions._post_sale_item();

-- إرجاع زبون: عكس قيد البيع
create or replace function exhibitions._post_sale_return_item() returns trigger
language plpgsql security definer set search_path=exhibitions,public as $$
declare v_si exhibitions.sale_items; v_rev numeric; v_cogs numeric; v_date date;
begin
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
drop trigger if exists trg_post_sale_return_item on exhibitions.sale_return_items;
create trigger trg_post_sale_return_item after insert on exhibitions.sale_return_items
  for each row execute function exhibitions._post_sale_return_item();

-- جملة: مدين نقد/شبكة / دائن إيراد الجملة ؛ مدين تكلفة / دائن المخزون
create or replace function exhibitions._post_wholesale_item() returns trigger
language plpgsql security definer set search_path=exhibitions,public as $$
declare v_pm exhibitions.payment_method; v_date date; v_cost numeric; v_rev numeric; v_cogs numeric; v_cash text;
begin
  select payment_method, created_at::date into v_pm, v_date from exhibitions.wholesale_orders where id=NEW.order_id;
  select cost_price_sar into v_cost from exhibitions.products where id=NEW.product_id;
  v_rev := NEW.qty * NEW.unit_price_sar;
  v_cogs := NEW.qty * coalesce(v_cost,0);
  v_cash := case when v_pm='card' then '1020' else '1010' end;
  perform exhibitions._post(v_date,'بيع جملة','wholesale_order_items',NEW.id,
    jsonb_build_array(
      jsonb_build_object('account',v_cash,'debit',v_rev,'credit',0),
      jsonb_build_object('account','4020','debit',0,'credit',v_rev),
      jsonb_build_object('account','5010','debit',v_cogs,'credit',0),
      jsonb_build_object('account','1100','debit',0,'credit',v_cogs)));
  return NEW;
end $$;
drop trigger if exists trg_post_wholesale_item on exhibitions.wholesale_order_items;
create trigger trg_post_wholesale_item after insert on exhibitions.wholesale_order_items
  for each row execute function exhibitions._post_wholesale_item();

-- مصروف: مدين مصاريف المعارض / دائن الصندوق
create or replace function exhibitions._post_expense() returns trigger
language plpgsql security definer set search_path=exhibitions,public as $$
begin
  perform exhibitions._post(NEW.expense_date,'مصروف: '||coalesce(NEW.category,''),'expenses',NEW.id,
    jsonb_build_array(
      jsonb_build_object('account','5100','debit',NEW.amount_sar,'credit',0),
      jsonb_build_object('account','1010','debit',0,'credit',NEW.amount_sar)));
  return NEW;
end $$;
drop trigger if exists trg_post_expense on exhibitions.expenses;
create trigger trg_post_expense after insert on exhibitions.expenses
  for each row execute function exhibitions._post_expense();

-- سُلفة: مدين سُلف الموظفين / دائن الصندوق
create or replace function exhibitions._post_advance() returns trigger
language plpgsql security definer set search_path=exhibitions,public as $$
begin
  perform exhibitions._post(NEW.created_at::date,'سُلفة موظف','salary_advances',NEW.id,
    jsonb_build_array(
      jsonb_build_object('account','1210','debit',NEW.amount_sar,'credit',0),
      jsonb_build_object('account','1010','debit',0,'credit',NEW.amount_sar)));
  return NEW;
end $$;
drop trigger if exists trg_post_advance on exhibitions.salary_advances;
create trigger trg_post_advance after insert on exhibitions.salary_advances
  for each row execute function exhibitions._post_advance();

-- تسوية عهدة (مقبولة): مدين الصندوق + عجز / دائن ذمم الموظفين
create or replace function exhibitions._post_settlement() returns trigger
language plpgsql security definer set search_path=exhibitions,public as $$
declare v_cash numeric; v_short numeric; v_total numeric;
begin
  if NEW.status = 'accepted' and (OLD.status is distinct from 'accepted') then
    v_cash := coalesce(NEW.admin_confirmed_amount_sar, NEW.total_declared_sar);
    v_short := coalesce(NEW.shortage_sar, 0);
    v_total := v_cash + v_short;
    if v_total <> 0 then
      perform exhibitions._post(coalesce(NEW.confirmed_at::date,current_date),'تسوية عهدة','consignment_settlements',NEW.id,
        jsonb_build_array(
          jsonb_build_object('account','1010','debit',v_cash,'credit',0),
          jsonb_build_object('account','5400','debit',greatest(v_short,0),'credit',0),
          jsonb_build_object('account','1200','debit',0,'credit',v_total)));
    end if;
  end if;
  return NEW;
end $$;
drop trigger if exists trg_post_settlement on exhibitions.consignment_settlements;
create trigger trg_post_settlement after update on exhibitions.consignment_settlements
  for each row execute function exhibitions._post_settlement();

-- رواتب (مدفوعة): مدين الرواتب (الإجمالي) / دائن سُلف الموظفين (المخصوم) + الصندوق (الصافي النقدي)
create or replace function exhibitions._post_payroll() returns trigger
language plpgsql security definer set search_path=exhibitions,public as $$
declare v_cash numeric;
begin
  if NEW.status = 'paid' and (OLD.status is distinct from 'paid') then
    v_cash := NEW.gross_sar - coalesce(NEW.advances_deducted_sar,0);
    perform exhibitions._post(current_date,'صرف راتب','payroll',NEW.id,
      jsonb_build_array(
        jsonb_build_object('account','5200','debit',NEW.gross_sar,'credit',0),
        jsonb_build_object('account','1210','debit',0,'credit',coalesce(NEW.advances_deducted_sar,0)),
        jsonb_build_object('account','1010','debit',0,'credit',v_cash)));
  end if;
  return NEW;
end $$;
drop trigger if exists trg_post_payroll on exhibitions.payroll;
create trigger trg_post_payroll after update on exhibitions.payroll
  for each row execute function exhibitions._post_payroll();

-- ---------- قيد يدوي (رأس مال / مسحوبات / سداد موردين / تسويات) ----------
create or replace function exhibitions.post_manual_journal(p_date date, p_memo text, p_lines jsonb)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  return exhibitions._post(p_date, p_memo, 'manual', null, p_lines);
end $$;

-- ---------- ترحيل العمولة (يحدّث set_commission_status) ----------
create or replace function exhibitions.set_commission_status(p_branch_id uuid, p_status text)
returns integer language plpgsql security definer set search_path=exhibitions,public as $$
declare n integer; v_sum numeric;
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  drop table if exists _chg;
  create temporary table _chg on commit drop as
  with upd as (
    update exhibitions.commissions
       set status = p_status::exhibitions.commission_status
     where branch_id = p_branch_id
       and status <> 'cancelled'
       and status <> p_status::exhibitions.commission_status
    returning id, beneficiary_id, commission_sar
  )
  select * from upd;
  select count(*), coalesce(sum(commission_sar),0) into n, v_sum from _chg;
  perform exhibitions._audit('commission_'||p_status,'commissions',p_branch_id,null,jsonb_build_object('count',n));
  if p_status = 'approved' and v_sum > 0 then
    perform exhibitions._post(current_date,'استحقاق عمولات','commissions',p_branch_id,
      jsonb_build_array(
        jsonb_build_object('account','5300','debit',v_sum,'credit',0),
        jsonb_build_object('account','2200','debit',0,'credit',v_sum)));
  elsif p_status = 'paid' and v_sum > 0 then
    perform exhibitions._post(current_date,'صرف عمولات','commissions',p_branch_id,
      jsonb_build_array(
        jsonb_build_object('account','2200','debit',v_sum,'credit',0),
        jsonb_build_object('account','1010','debit',0,'credit',v_sum)));
  end if;
  if p_status in ('approved','paid') then
    insert into exhibitions.notifications(recipient_id,type,title,body,ref_table,ref_id)
      select beneficiary_id,'commission',
        case when p_status='paid' then 'تم صرف العمولة' else 'تم اعتماد العمولة' end,
        'عمولة معرض بقيمة '||commission_sar::text||' ر.س','commissions',id
      from _chg where beneficiary_id is not null;
  end if;
  return n;
end $$;

-- ============================================================
-- التقارير المالية (للأدمن فقط)
-- ============================================================
create or replace function exhibitions.trial_balance(p_from date default null, p_to date default null)
returns json language sql stable security definer set search_path=exhibitions,public as $$
  select coalesce(json_agg(row_to_json(t) order by t.sort),'[]') from (
    select a.code, a.name, a.type, a.sort,
      coalesce(sum(l.debit),0) as debit,
      coalesce(sum(l.credit),0) as credit,
      coalesce(sum(l.debit),0) - coalesce(sum(l.credit),0) as balance
    from exhibitions.accounts a
    left join exhibitions.journal_lines l on l.account_code=a.code
    left join exhibitions.journal_entries e on e.id=l.entry_id
      and (p_from is null or e.entry_date>=p_from)
      and (p_to is null or e.entry_date<=p_to)
    group by a.code,a.name,a.type,a.sort
    having coalesce(sum(l.debit),0) <> 0 or coalesce(sum(l.credit),0) <> 0
  ) t;
$$;

create or replace function exhibitions.income_statement(p_from date default null, p_to date default null)
returns json language sql stable security definer set search_path=exhibitions,public as $$
  with l as (
    select a.code,a.name,a.type, coalesce(sum(l.credit-l.debit),0) as net
    from exhibitions.accounts a
    left join exhibitions.journal_lines l on l.account_code=a.code
    left join exhibitions.journal_entries e on e.id=l.entry_id
      and (p_from is null or e.entry_date>=p_from) and (p_to is null or e.entry_date<=p_to)
    where a.type in ('revenue','expense')
    group by a.code,a.name,a.type
  )
  select json_build_object(
    'revenue', (select coalesce(sum(net),0) from l where type='revenue'),
    'expenses', (select coalesce(-sum(net),0) from l where type='expense'),
    'net_profit', (select coalesce(sum(net),0) from l),
    'lines', (select coalesce(json_agg(json_build_object('code',code,'name',name,'type',type,
                'amount', case when type='revenue' then net else -net end)),'[]') from l)
  );
$$;

create or replace function exhibitions.balance_sheet(p_as_of date default null)
returns json language sql stable security definer set search_path=exhibitions,public as $$
  with l as (
    select a.code,a.name,a.type,
      coalesce(sum(l.debit),0)-coalesce(sum(l.credit),0) as dr_balance,
      coalesce(sum(l.credit),0)-coalesce(sum(l.debit),0) as cr_balance
    from exhibitions.accounts a
    left join exhibitions.journal_lines l on l.account_code=a.code
    left join exhibitions.journal_entries e on e.id=l.entry_id and (p_as_of is null or e.entry_date<=p_as_of)
    group by a.code,a.name,a.type
  ),
  ni as (select coalesce(sum(case when type='revenue' then cr_balance when type='expense' then -dr_balance*0 - cr_balance else 0 end),0) x from l)
  select json_build_object(
    'assets', (select coalesce(json_agg(json_build_object('code',code,'name',name,'balance',dr_balance)),'[]') from l where type='asset' and dr_balance<>0),
    'total_assets', (select coalesce(sum(dr_balance),0) from l where type='asset'),
    'liabilities', (select coalesce(json_agg(json_build_object('code',code,'name',name,'balance',cr_balance)),'[]') from l where type='liability' and cr_balance<>0),
    'total_liabilities', (select coalesce(sum(cr_balance),0) from l where type='liability'),
    'equity', (select coalesce(json_agg(json_build_object('code',code,'name',name,'balance',cr_balance)),'[]') from l where type='equity' and cr_balance<>0),
    'total_equity', (select coalesce(sum(cr_balance),0) from l where type='equity'),
    'net_income', (select coalesce(sum(cr_balance),0) from l where type in ('revenue','expense'))
  );
$$;

create or replace function exhibitions.account_ledger(p_code text, p_from date default null, p_to date default null)
returns json language sql stable security definer set search_path=exhibitions,public as $$
  select coalesce(json_agg(json_build_object(
      'date',e.entry_date,'memo',e.memo,'debit',l.debit,'credit',l.credit,
      'source',e.source_table) order by e.entry_date, e.created_at),'[]')
  from exhibitions.journal_lines l
  join exhibitions.journal_entries e on e.id=l.entry_id
  where l.account_code=p_code
    and (p_from is null or e.entry_date>=p_from) and (p_to is null or e.entry_date<=p_to);
$$;

-- ملخص مالي سريع للوحة
create or replace function exhibitions.financial_summary()
returns json language sql stable security definer set search_path=exhibitions,public as $$
  with b as (
    select a.code, coalesce(sum(l.debit-l.credit),0) as bal
    from exhibitions.accounts a left join exhibitions.journal_lines l on l.account_code=a.code
    group by a.code
  )
  select json_build_object(
    'cash', (select coalesce(bal,0) from b where code='1010'),
    'card', (select coalesce(bal,0) from b where code='1020'),
    'inventory_value', (select coalesce(bal,0) from b where code='1100'),
    'employee_receivable', (select coalesce(bal,0) from b where code='1200'),
    'suppliers_payable', (select coalesce(-bal,0) from b where code='2010'),
    'commissions_payable', (select coalesce(-bal,0) from b where code='2200')
  );
$$;

grant execute on function exhibitions.post_manual_journal(date,text,jsonb) to authenticated;
grant execute on function exhibitions.trial_balance(date,date) to authenticated;
grant execute on function exhibitions.income_statement(date,date) to authenticated;
grant execute on function exhibitions.balance_sheet(date) to authenticated;
grant execute on function exhibitions.account_ledger(text,date,date) to authenticated;
grant execute on function exhibitions.financial_summary() to authenticated;
