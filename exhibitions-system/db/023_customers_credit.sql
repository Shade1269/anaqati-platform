-- ============================================================
-- حسابات العملاء ودفتر الدين (البيع الآجل) | Migration 023
-- مهم للسوق السوري (البيع بالدين شائع): عميل له رصيد دين، تُسجّل عليه
-- مبالغ (دين/آجل) وتُسجّل تسديداته، مع كشف حساب. متكامل محاسبيًا:
--   دين/آجل  → مدين 1300 ذمم العملاء / دائن 4010 إيرادات المبيعات
--   تسديد    → مدين 1010/1020 نقد/شبكة / دائن 1300 ذمم العملاء
-- الصلاحية: المالك أو مدير بصلاحية can_manage_store.
-- ============================================================

create table if not exists exhibitions.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references exhibitions.tenants(id) on delete cascade,
  name text not null,
  phone text,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists exhibitions.customer_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references exhibitions.tenants(id) on delete cascade,
  customer_id uuid not null references exhibitions.customers(id) on delete cascade,
  kind text not null check (kind in ('charge','payment')),
  amount numeric(14,2) not null check (amount > 0),
  method text,            -- للتسديد: cash/card
  note text,
  created_by uuid references exhibitions.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

do $$
declare t text; tbls text[] := array['customers','customer_entries'];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_set_tenant on exhibitions.%I', t);
    execute format('create trigger trg_set_tenant before insert on exhibitions.%I for each row execute function exhibitions._set_tenant()', t);
    execute format('create index if not exists idx_%s_tenant on exhibitions.%I(tenant_id)', t, t);
    execute format('alter table exhibitions.%I enable row level security', t);
    execute format('drop policy if exists admin_all on exhibitions.%I', t);
    execute format('create policy admin_all on exhibitions.%I for all to authenticated using (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id())', t);
    execute format('drop policy if exists mgr_cust on exhibitions.%I', t);
    execute format('create policy mgr_cust on exhibitions.%I for all to authenticated using (exhibitions._im_can(''can_manage_store'') and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions._im_can(''can_manage_store'') and tenant_id=exhibitions.current_tenant_id())', t);
    execute format('grant select,insert,update,delete on exhibitions.%I to authenticated', t);
    execute format('grant all on exhibitions.%I to service_role', t);
  end loop;
end $$;
create index if not exists idx_cust_entries_customer on exhibitions.customer_entries(customer_id);

create or replace function exhibitions._cust_tenant() returns uuid
language plpgsql stable security definer set search_path=exhibitions,public as $$
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_manage_store')) then raise exception 'غير مصرّح'; end if;
  return exhibitions.current_tenant_id();
end $$;
revoke execute on function exhibitions._cust_tenant() from public, anon, authenticated;

create or replace function exhibitions.customers_list()
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._cust_tenant();
begin
  return (select coalesce(json_agg(row_to_json(x) order by (x.balance) desc, x.name),'[]') from (
    select c.id,c.name,c.phone,c.note,c.is_active,
      coalesce((select sum(case when e.kind='charge' then e.amount else -e.amount end) from exhibitions.customer_entries e where e.customer_id=c.id),0) as balance
    from exhibitions.customers c where c.tenant_id=v_t) x);
end $$;

create or replace function exhibitions.customer_set(p_id uuid, p_name text, p_phone text, p_note text, p_active boolean default true)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._cust_tenant(); v_id uuid;
begin
  if p_id is null then
    insert into exhibitions.customers(tenant_id,name,phone,note,is_active) values(v_t,p_name,p_phone,p_note,coalesce(p_active,true)) returning id into v_id;
  else
    update exhibitions.customers set name=p_name,phone=p_phone,note=p_note,is_active=coalesce(p_active,true)
      where id=p_id and tenant_id=v_t returning id into v_id;
    if v_id is null then raise exception 'العميل غير موجود'; end if;
  end if; return v_id;
end $$;

-- تسجيل دين/بيع آجل على العميل
create or replace function exhibitions.customer_charge(p_customer_id uuid, p_amount numeric, p_note text default null)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._cust_tenant(); v_actor uuid := exhibitions.current_profile_id(); v_e uuid;
begin
  if coalesce(p_amount,0) <= 0 then raise exception 'المبلغ غير صحيح'; end if;
  if not exists(select 1 from exhibitions.customers where id=p_customer_id and tenant_id=v_t) then raise exception 'العميل غير موجود'; end if;
  insert into exhibitions.customer_entries(tenant_id,customer_id,kind,amount,note,created_by)
    values(v_t,p_customer_id,'charge',p_amount,p_note,v_actor) returning id into v_e;
  perform exhibitions._post(current_date,'بيع آجل (دين عميل)','customer_entries',v_e,
    jsonb_build_array(jsonb_build_object('account','1300','debit',p_amount,'credit',0),
                      jsonb_build_object('account','4010','debit',0,'credit',p_amount)));
end $$;

-- تسجيل تسديد من العميل
create or replace function exhibitions.customer_payment(p_customer_id uuid, p_amount numeric, p_method text default 'cash', p_note text default null)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._cust_tenant(); v_actor uuid := exhibitions.current_profile_id(); v_e uuid; v_cash text; v_m text;
begin
  if coalesce(p_amount,0) <= 0 then raise exception 'المبلغ غير صحيح'; end if;
  if not exists(select 1 from exhibitions.customers where id=p_customer_id and tenant_id=v_t) then raise exception 'العميل غير موجود'; end if;
  v_m := case when p_method='card' then 'card' else 'cash' end;
  v_cash := case when v_m='card' then '1020' else '1010' end;
  insert into exhibitions.customer_entries(tenant_id,customer_id,kind,amount,method,note,created_by)
    values(v_t,p_customer_id,'payment',p_amount,v_m,p_note,v_actor) returning id into v_e;
  perform exhibitions._post(current_date,'تسديد عميل','customer_entries',v_e,
    jsonb_build_array(jsonb_build_object('account',v_cash,'debit',p_amount,'credit',0),
                      jsonb_build_object('account','1300','debit',0,'credit',p_amount)));
end $$;

create or replace function exhibitions.customer_statement(p_customer_id uuid)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._cust_tenant();
begin
  if not exists(select 1 from exhibitions.customers where id=p_customer_id and tenant_id=v_t) then raise exception 'العميل غير موجود'; end if;
  return json_build_object(
    'customer',(select row_to_json(c) from (select id,name,phone,note from exhibitions.customers where id=p_customer_id) c),
    'entries',(select coalesce(json_agg(json_build_object('id',e.id,'kind',e.kind,'amount',e.amount,'method',e.method,'note',e.note,'created_at',e.created_at) order by e.created_at),'[]')
       from exhibitions.customer_entries e where e.customer_id=p_customer_id),
    'total_charged',(select coalesce(sum(amount),0) from exhibitions.customer_entries where customer_id=p_customer_id and kind='charge'),
    'total_paid',(select coalesce(sum(amount),0) from exhibitions.customer_entries where customer_id=p_customer_id and kind='payment'),
    'balance',(select coalesce(sum(case when kind='charge' then amount else -amount end),0) from exhibitions.customer_entries where customer_id=p_customer_id));
end $$;

grant execute on function exhibitions.customers_list() to authenticated;
grant execute on function exhibitions.customer_set(uuid,text,text,text,boolean) to authenticated;
grant execute on function exhibitions.customer_charge(uuid,numeric,text) to authenticated;
grant execute on function exhibitions.customer_payment(uuid,numeric,text,text) to authenticated;
grant execute on function exhibitions.customer_statement(uuid) to authenticated;
