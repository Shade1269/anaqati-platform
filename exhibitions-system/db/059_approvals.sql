-- ============================================================
-- محرّك الموافقات العام (Approval Engine) | Migration 059
-- قواعد موافقة حسب النوع والحد، صندوق طلبات موافقة، واعتماد/رفض.
-- أول تدفّق مربوط: المصروفات — إن تجاوز المبلغ الحدّ يذهب لموافقة المالك،
-- وعند الاعتماد يُسجّل المصروف (يرحّل محاسبيًا عبر مُحفّز expenses).
-- الطلب: المالك أو مدير (can_manage_store). القرار: المالك فقط.
-- ============================================================

-- 1) الجداول
create table if not exists exhibitions.approval_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references exhibitions.tenants(id) on delete cascade,
  kind text not null check (kind in ('expense','discount','wholesale','purchase','advance','other')),
  threshold numeric(14,2) not null default 0,   -- يتطلب موافقة إذا المبلغ >= الحد
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists exhibitions.approval_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references exhibitions.tenants(id) on delete cascade,
  kind text not null,
  title text,
  amount numeric(14,2) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid references exhibitions.profiles(id) on delete set null,
  decided_by uuid references exhibitions.profiles(id) on delete set null,
  decided_at timestamptz,
  note text,
  result_ref uuid,                              -- الكيان الناتج بعد الاعتماد (مثلاً مصروف)
  created_at timestamptz not null default now()
);

-- 2) الفهارس + RLS
do $$
declare t text; tbls text[] := array['approval_rules','approval_requests'];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_set_tenant on exhibitions.%I', t);
    execute format('create trigger trg_set_tenant before insert on exhibitions.%I for each row execute function exhibitions._set_tenant()', t);
    execute format('create index if not exists idx_%s_tenant on exhibitions.%I(tenant_id)', t, t);
    execute format('alter table exhibitions.%I enable row level security', t);
    execute format('drop policy if exists admin_all on exhibitions.%I', t);
    execute format('create policy admin_all on exhibitions.%I for all to authenticated using (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id())', t);
    execute format('drop policy if exists mgr_appr on exhibitions.%I', t);
    execute format('create policy mgr_appr on exhibitions.%I for all to authenticated using (exhibitions._im_can(''can_manage_store'') and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions._im_can(''can_manage_store'') and tenant_id=exhibitions.current_tenant_id())', t);
    execute format('grant select,insert,update,delete on exhibitions.%I to authenticated', t);
    execute format('grant all on exhibitions.%I to service_role', t);
  end loop;
end $$;
create index if not exists idx_appr_req_status on exhibitions.approval_requests(tenant_id, status);

-- 3) البوابات
create or replace function exhibitions._appr_tenant() returns uuid
language plpgsql stable security definer set search_path=exhibitions,public as $$
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_manage_store')) then raise exception 'غير مصرّح'; end if;
  return exhibitions.current_tenant_id();
end $$;
revoke execute on function exhibitions._appr_tenant() from public, anon, authenticated;

create or replace function exhibitions._appr_admin() returns uuid
language plpgsql stable security definer set search_path=exhibitions,public as $$
begin
  if not exhibitions.is_admin() then raise exception 'الاعتماد للمالك فقط'; end if;
  return exhibitions.current_tenant_id();
end $$;
revoke execute on function exhibitions._appr_admin() from public, anon, authenticated;

-- ============================================================
-- 4) قواعد الموافقة
-- ============================================================
create or replace function exhibitions.approval_rules_list()
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._appr_tenant();
begin
  return (select coalesce(json_agg(row_to_json(x) order by x.kind),'[]') from (
    select id, kind, threshold, is_active, created_at from exhibitions.approval_rules where tenant_id=v_t) x);
end $$;

create or replace function exhibitions.approval_rule_set(p_id uuid, p_kind text, p_threshold numeric, p_active boolean)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._appr_admin(); v_id uuid;
begin
  if p_kind not in ('expense','discount','wholesale','purchase','advance','other') then raise exception 'نوع غير صحيح'; end if;
  if p_id is null then
    insert into exhibitions.approval_rules(kind,threshold,is_active)
      values(p_kind, greatest(coalesce(p_threshold,0),0), coalesce(p_active,true)) returning id into v_id;
  else
    update exhibitions.approval_rules set kind=p_kind, threshold=greatest(coalesce(p_threshold,0),0),
      is_active=coalesce(p_active,true) where id=p_id and tenant_id=v_t returning id into v_id;
    if v_id is null then raise exception 'القاعدة غير موجودة'; end if;
  end if;
  return v_id;
end $$;

create or replace function exhibitions.approval_rule_delete(p_id uuid)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._appr_admin();
begin
  delete from exhibitions.approval_rules where id=p_id and tenant_id=v_t;
end $$;

-- هل يتطلب النوع/المبلغ موافقة؟ (قاعدة فعّالة والمبلغ >= الحد)
create or replace function exhibitions.approval_required(p_kind text, p_amount numeric)
returns boolean language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._appr_tenant();
begin
  return exists(select 1 from exhibitions.approval_rules
    where tenant_id=v_t and kind=p_kind and is_active and coalesce(p_amount,0) >= threshold);
end $$;

-- ============================================================
-- 5) طلبات الموافقة (الصندوق + القرار)
-- ============================================================
create or replace function exhibitions.approval_requests_list(p_status text default null)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._appr_tenant();
begin
  return (select coalesce(json_agg(row_to_json(x) order by x.created_at desc),'[]') from (
    select r.id, r.kind, r.title, r.amount, r.payload, r.status,
           (select full_name from exhibitions.profiles where id=r.requested_by) as requested_by_name,
           (select full_name from exhibitions.profiles where id=r.decided_by) as decided_by_name,
           r.decided_at, r.note, r.result_ref, r.created_at
    from exhibitions.approval_requests r
    where r.tenant_id=v_t and (p_status is null or r.status=p_status)) x);
end $$;

create or replace function exhibitions.approval_request_create(p_kind text, p_title text, p_amount numeric, p_payload jsonb)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._appr_tenant(); v_id uuid;
begin
  insert into exhibitions.approval_requests(kind,title,amount,payload,requested_by)
    values(p_kind, nullif(p_title,''), greatest(coalesce(p_amount,0),0), coalesce(p_payload,'{}'::jsonb),
           exhibitions.current_profile_id()) returning id into v_id;
  return v_id;
end $$;

-- اعتماد/رفض طلب. عند اعتماد نوع 'expense' يُسجّل المصروف فعليًا.
create or replace function exhibitions.approval_decide(p_id uuid, p_decision text, p_note text default null)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._appr_admin(); r exhibitions.approval_requests; v_ref uuid; v_p jsonb;
begin
  if p_decision not in ('approved','rejected') then raise exception 'قرار غير صحيح'; end if;
  select * into r from exhibitions.approval_requests where id=p_id and tenant_id=v_t;
  if r.id is null then raise exception 'الطلب غير موجود'; end if;
  if r.status <> 'pending' then raise exception 'الطلب محسوم مسبقًا'; end if;

  if p_decision='approved' then
    v_p := r.payload;
    if r.kind='expense' then
      insert into exhibitions.expenses(scope,branch_id,category,amount_sar,description,expense_date,created_by)
        values( coalesce(nullif(v_p->>'scope','')::exhibitions.expense_scope,'general'),
                nullif(v_p->>'branch_id','')::uuid, nullif(v_p->>'category',''),
                (v_p->>'amount')::numeric, nullif(v_p->>'description',''),
                coalesce((v_p->>'expense_date')::date, current_date), r.requested_by)
        returning id into v_ref;
    end if;
  end if;

  update exhibitions.approval_requests set status=p_decision, decided_by=exhibitions.current_profile_id(),
    decided_at=now(), note=nullif(p_note,''), result_ref=v_ref where id=p_id;

  return json_build_object('id',p_id,'status',p_decision,'result_ref',v_ref);
end $$;

-- ============================================================
-- 6) تقديم مصروف (مربوط بمحرّك الموافقات)
--    إن تجاوز المبلغ الحدّ ⇒ طلب موافقة (pending)، وإلا يُسجّل فورًا.
-- ============================================================
create or replace function exhibitions.expense_submit(
  p_amount numeric, p_category text, p_description text,
  p_scope text default 'general', p_branch_id uuid default null, p_date date default null)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._appr_tenant(); v_amt numeric := greatest(coalesce(p_amount,0),0);
        v_exp uuid; v_req uuid; v_scope text := coalesce(nullif(p_scope,''),'general');
begin
  if v_amt <= 0 then raise exception 'المبلغ غير صحيح'; end if;
  if v_scope not in ('general','branch') then v_scope := 'general'; end if;

  if exhibitions.approval_required('expense', v_amt) then
    v_req := exhibitions.approval_request_create('expense',
      'مصروف: '||coalesce(nullif(p_category,''),'—'), v_amt,
      jsonb_build_object('amount',v_amt,'category',p_category,'description',p_description,
        'scope',v_scope,'branch_id',p_branch_id,'expense_date',coalesce(p_date,current_date)));
    return json_build_object('status','pending','request_id',v_req);
  end if;

  insert into exhibitions.expenses(scope,branch_id,category,amount_sar,description,expense_date,created_by)
    values(v_scope::exhibitions.expense_scope, p_branch_id, nullif(p_category,''), v_amt,
           nullif(p_description,''), coalesce(p_date,current_date), exhibitions.current_profile_id())
    returning id into v_exp;
  return json_build_object('status','posted','expense_id',v_exp);
end $$;

-- 7) المنح
grant execute on function exhibitions.approval_rules_list() to authenticated;
grant execute on function exhibitions.approval_rule_set(uuid,text,numeric,boolean) to authenticated;
grant execute on function exhibitions.approval_rule_delete(uuid) to authenticated;
grant execute on function exhibitions.approval_required(text,numeric) to authenticated;
grant execute on function exhibitions.approval_requests_list(text) to authenticated;
grant execute on function exhibitions.approval_request_create(text,text,numeric,jsonb) to authenticated;
grant execute on function exhibitions.approval_decide(uuid,text,text) to authenticated;
grant execute on function exhibitions.expense_submit(numeric,text,text,text,uuid,date) to authenticated;
