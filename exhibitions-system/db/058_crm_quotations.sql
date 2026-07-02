-- ============================================================
-- CRM + عروض الأسعار (Quotations) | Migration 058
-- "ما قبل البيع": عملاء محتملون (leads) بمسار مبيعات (pipeline)،
-- وعروض أسعار تتحوّل إلى أمر بيع جملة (يرحّل محاسبيًا عبر المحرّك الموجود).
-- الصلاحية: المالك أو مدير بصلاحية can_manage_store (نفس نمط العملاء).
-- لا قيود محاسبية على العرض نفسه — الترحيل يحدث فقط عند التحويل لأمر بيع.
-- ============================================================

-- 1) الجداول
create table if not exists exhibitions.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references exhibitions.tenants(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  company text,
  source text,                         -- مصدر العميل المحتمل (إحالة/إعلان/زيارة...)
  stage text not null default 'new'
    check (stage in ('new','contacted','qualified','proposal','won','lost')),
  est_value numeric(14,2) not null default 0,   -- القيمة المتوقعة للصفقة
  assigned_to uuid references exhibitions.profiles(id) on delete set null,
  customer_id uuid references exhibitions.customers(id) on delete set null, -- بعد التحويل
  note text,
  created_by uuid references exhibitions.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists exhibitions.quotations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references exhibitions.tenants(id) on delete cascade,
  quote_no text,
  customer_id uuid references exhibitions.customers(id) on delete set null,
  lead_id uuid references exhibitions.leads(id) on delete set null,
  customer_name text,
  customer_phone text,
  status text not null default 'draft'
    check (status in ('draft','sent','accepted','rejected','converted','expired')),
  valid_until date,
  subtotal numeric(14,2) not null default 0,
  discount_sar numeric(14,2) not null default 0,   -- خصم على مستوى العرض
  total_sar numeric(14,2) not null default 0,
  note text,
  converted_order_id uuid,                          -- أمر البيع الناتج
  created_by uuid references exhibitions.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists exhibitions.quotation_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references exhibitions.tenants(id) on delete cascade,
  quotation_id uuid not null references exhibitions.quotations(id) on delete cascade,
  product_id uuid not null references exhibitions.products(id) on delete restrict,
  qty numeric(14,3) not null check (qty > 0),
  unit_price numeric(14,2) not null default 0,
  uom_id uuid references exhibitions.product_uoms(id) on delete set null,
  line_discount numeric(14,2) not null default 0
);

-- 2) الفهارس + RLS (نفس نمط باقي الوحدات)
do $$
declare t text; tbls text[] := array['leads','quotations','quotation_items'];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_set_tenant on exhibitions.%I', t);
    execute format('create trigger trg_set_tenant before insert on exhibitions.%I for each row execute function exhibitions._set_tenant()', t);
    execute format('create index if not exists idx_%s_tenant on exhibitions.%I(tenant_id)', t, t);
    execute format('alter table exhibitions.%I enable row level security', t);
    execute format('drop policy if exists admin_all on exhibitions.%I', t);
    execute format('create policy admin_all on exhibitions.%I for all to authenticated using (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id())', t);
    execute format('drop policy if exists mgr_crm on exhibitions.%I', t);
    execute format('create policy mgr_crm on exhibitions.%I for all to authenticated using (exhibitions._im_can(''can_manage_store'') and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions._im_can(''can_manage_store'') and tenant_id=exhibitions.current_tenant_id())', t);
    execute format('grant select,insert,update,delete on exhibitions.%I to authenticated', t);
    execute format('grant all on exhibitions.%I to service_role', t);
  end loop;
end $$;
create index if not exists idx_quotation_items_q on exhibitions.quotation_items(quotation_id);
create index if not exists idx_quotations_customer on exhibitions.quotations(customer_id);
create index if not exists idx_leads_stage on exhibitions.leads(tenant_id, stage);

-- 3) بوابة الصلاحية
create or replace function exhibitions._crm_tenant() returns uuid
language plpgsql stable security definer set search_path=exhibitions,public as $$
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_manage_store')) then raise exception 'غير مصرّح'; end if;
  return exhibitions.current_tenant_id();
end $$;
revoke execute on function exhibitions._crm_tenant() from public, anon, authenticated;

-- ============================================================
-- 4) العملاء المحتملون (Leads / Pipeline)
-- ============================================================
create or replace function exhibitions.leads_list(p_stage text default null)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._crm_tenant();
begin
  return (select coalesce(json_agg(row_to_json(x) order by x.created_at desc),'[]') from (
    select l.id, l.name, l.phone, l.email, l.company, l.source, l.stage, l.est_value,
           l.assigned_to, (select full_name from exhibitions.profiles where id=l.assigned_to) as assigned_name,
           l.customer_id, l.note, l.created_at, l.updated_at
    from exhibitions.leads l
    where l.tenant_id=v_t and (p_stage is null or l.stage=p_stage)) x);
end $$;

create or replace function exhibitions.lead_set(
  p_id uuid, p_name text, p_phone text, p_email text, p_company text,
  p_source text, p_stage text, p_est_value numeric, p_assigned_to uuid, p_note text)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._crm_tenant(); v_id uuid; v_stage text := coalesce(nullif(p_stage,''),'new');
begin
  if v_stage not in ('new','contacted','qualified','proposal','won','lost') then raise exception 'مرحلة غير صحيحة'; end if;
  if coalesce(trim(p_name),'')='' then raise exception 'الاسم مطلوب'; end if;
  if p_id is null then
    insert into exhibitions.leads(name,phone,email,company,source,stage,est_value,assigned_to,note,created_by)
      values(trim(p_name),nullif(p_phone,''),nullif(p_email,''),nullif(p_company,''),nullif(p_source,''),
             v_stage,greatest(coalesce(p_est_value,0),0),p_assigned_to,nullif(p_note,''),exhibitions.current_profile_id())
      returning id into v_id;
  else
    update exhibitions.leads set name=trim(p_name), phone=nullif(p_phone,''), email=nullif(p_email,''),
      company=nullif(p_company,''), source=nullif(p_source,''), stage=v_stage,
      est_value=greatest(coalesce(p_est_value,0),0), assigned_to=p_assigned_to, note=nullif(p_note,''), updated_at=now()
      where id=p_id and tenant_id=v_t returning id into v_id;
    if v_id is null then raise exception 'العميل المحتمل غير موجود'; end if;
  end if;
  return v_id;
end $$;

create or replace function exhibitions.lead_set_stage(p_id uuid, p_stage text)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._crm_tenant();
begin
  if p_stage not in ('new','contacted','qualified','proposal','won','lost') then raise exception 'مرحلة غير صحيحة'; end if;
  update exhibitions.leads set stage=p_stage, updated_at=now() where id=p_id and tenant_id=v_t;
  if not found then raise exception 'العميل المحتمل غير موجود'; end if;
end $$;

create or replace function exhibitions.lead_delete(p_id uuid)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._crm_tenant();
begin
  delete from exhibitions.leads where id=p_id and tenant_id=v_t;
end $$;

-- تحويل عميل محتمل إلى عميل فعلي (customers)
create or replace function exhibitions.lead_convert_customer(p_id uuid)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._crm_tenant(); v_lead exhibitions.leads; v_cust uuid;
begin
  select * into v_lead from exhibitions.leads where id=p_id and tenant_id=v_t;
  if v_lead.id is null then raise exception 'العميل المحتمل غير موجود'; end if;
  if v_lead.customer_id is not null then return v_lead.customer_id; end if;
  insert into exhibitions.customers(name,phone,note,is_active)
    values(v_lead.name, v_lead.phone, v_lead.note, true) returning id into v_cust;
  update exhibitions.leads set customer_id=v_cust, stage='won', updated_at=now() where id=p_id;
  return v_cust;
end $$;

-- ============================================================
-- 5) عروض الأسعار (Quotations)
-- ============================================================
create or replace function exhibitions.quotations_list(p_status text default null)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._crm_tenant();
begin
  return (select coalesce(json_agg(row_to_json(x) order by x.created_at desc),'[]') from (
    select q.id, q.quote_no, q.customer_id,
           coalesce((select name from exhibitions.customers where id=q.customer_id), q.customer_name) as customer_name,
           q.lead_id, q.status, q.valid_until, q.subtotal, q.discount_sar, q.total_sar,
           q.converted_order_id, q.created_at,
           (select count(*) from exhibitions.quotation_items where quotation_id=q.id) as items_count
    from exhibitions.quotations q
    where q.tenant_id=v_t and (p_status is null or q.status=p_status)) x);
end $$;

create or replace function exhibitions.quotation_get(p_id uuid)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._crm_tenant();
begin
  return (select json_build_object(
    'quote',(select row_to_json(o) from (
       select q.id, q.quote_no, q.customer_id,
              coalesce((select name from exhibitions.customers where id=q.customer_id), q.customer_name) as customer_name,
              q.customer_phone, q.lead_id, q.status, q.valid_until, q.subtotal, q.discount_sar,
              q.total_sar, q.note, q.converted_order_id, q.created_at
       from exhibitions.quotations q where q.id=p_id and q.tenant_id=v_t) o),
    'items',(select coalesce(json_agg(row_to_json(it)),'[]') from (
       select qi.id, qi.product_id, p.name as product_name, p.product_code, qi.qty,
              qi.unit_price, qi.uom_id, qi.line_discount
       from exhibitions.quotation_items qi join exhibitions.products p on p.id=qi.product_id
       where qi.quotation_id=p_id) it)
  ));
end $$;

-- إنشاء/تعديل عرض سعر (يعيد حساب الإجماليات؛ يبقى مسودة)
create or replace function exhibitions.quotation_set(
  p_id uuid, p_customer_id uuid, p_lead_id uuid, p_customer_name text, p_customer_phone text,
  p_valid_until date, p_discount numeric, p_note text, p_items jsonb)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._crm_tenant(); v_id uuid; r jsonb;
        v_sub numeric:=0; v_disc numeric := greatest(coalesce(p_discount,0),0); v_pid uuid; v_qty numeric;
        v_price numeric; v_ld numeric; v_seq int;
begin
  if p_id is null then
    select count(*)+1 into v_seq from exhibitions.quotations where tenant_id=v_t;
    insert into exhibitions.quotations(quote_no,customer_id,lead_id,customer_name,customer_phone,valid_until,
        discount_sar,note,status,created_by)
      values('Q'||lpad(v_seq::text,5,'0'), p_customer_id, p_lead_id, nullif(p_customer_name,''),
        nullif(p_customer_phone,''), p_valid_until, v_disc, nullif(p_note,''), 'draft', exhibitions.current_profile_id())
      returning id into v_id;
  else
    update exhibitions.quotations set customer_id=p_customer_id, lead_id=p_lead_id,
      customer_name=nullif(p_customer_name,''), customer_phone=nullif(p_customer_phone,''),
      valid_until=p_valid_until, discount_sar=v_disc, note=nullif(p_note,'')
      where id=p_id and tenant_id=v_t and status in ('draft','sent') returning id into v_id;
    if v_id is null then raise exception 'العرض غير موجود أو لا يمكن تعديله'; end if;
    delete from exhibitions.quotation_items where quotation_id=v_id;
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_pid:=(r->>'product_id')::uuid; v_qty:=(r->>'qty')::numeric;
    v_price:=coalesce((r->>'unit_price')::numeric,0); v_ld:=greatest(coalesce((r->>'line_discount')::numeric,0),0);
    if not exists(select 1 from exhibitions.products where id=v_pid and tenant_id=v_t) then raise exception 'منتج غير صحيح'; end if;
    if v_qty is null or v_qty<=0 then raise exception 'كمية غير صحيحة'; end if;
    insert into exhibitions.quotation_items(quotation_id,product_id,qty,unit_price,uom_id,line_discount)
      values(v_id, v_pid, v_qty, v_price, nullif(r->>'uom_id','')::uuid, v_ld);
    v_sub := v_sub + greatest(v_qty*v_price - v_ld, 0);
  end loop;

  update exhibitions.quotations set subtotal=v_sub, total_sar=greatest(v_sub - v_disc,0) where id=v_id;
  return v_id;
end $$;

create or replace function exhibitions.quotation_set_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._crm_tenant();
begin
  if p_status not in ('draft','sent','accepted','rejected','expired') then raise exception 'حالة غير صحيحة'; end if;
  update exhibitions.quotations set status=p_status where id=p_id and tenant_id=v_t and status<>'converted';
  if not found then raise exception 'العرض غير موجود أو مُحوّل مسبقًا'; end if;
end $$;

-- تحويل عرض مقبول إلى أمر بيع جملة (يرحّل محاسبيًا عبر create_wholesale_order)
create or replace function exhibitions.quotation_convert(p_id uuid, p_warehouse_id uuid, p_payment_method text default 'cash')
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._crm_tenant(); v_q exhibitions.quotations; v_items jsonb:='[]'::jsonb;
        r record; v_net_lines numeric:=0; v_factor numeric; v_eff numeric; v_res json; v_order uuid;
        v_name text; v_phone text;
begin
  select * into v_q from exhibitions.quotations where id=p_id and tenant_id=v_t;
  if v_q.id is null then raise exception 'العرض غير موجود'; end if;
  if v_q.status='converted' then raise exception 'العرض مُحوّل مسبقًا'; end if;
  if not exists(select 1 from exhibitions.quotation_items where quotation_id=p_id) then raise exception 'العرض لا يحتوي أصنافًا'; end if;

  -- صافي الأسطر بعد خصم السطر
  select sum(greatest(qty*unit_price - line_discount,0)) into v_net_lines
    from exhibitions.quotation_items where quotation_id=p_id;
  if coalesce(v_net_lines,0) <= 0 then v_net_lines := 1; end if;
  -- معامل توزيع خصم العرض على الأسطر ليطابق الإجمالي
  v_factor := greatest(v_net_lines - coalesce(v_q.discount_sar,0), 0) / v_net_lines;

  for r in select qi.product_id, qi.qty, qi.unit_price, qi.uom_id, qi.line_discount
           from exhibitions.quotation_items qi where qi.quotation_id=p_id loop
    -- سعر وحدة فعّال = (صافي السطر × المعامل) ÷ الكمية
    v_eff := round( (greatest(r.qty*r.unit_price - r.line_discount,0) * v_factor) / nullif(r.qty,0), 2);
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_id', r.product_id, 'qty', r.qty, 'unit_price', v_eff,
      'uom_id', case when r.uom_id is null then null else r.uom_id::text end));
  end loop;

  v_name := coalesce((select name from exhibitions.customers where id=v_q.customer_id), v_q.customer_name);
  v_phone := coalesce((select phone from exhibitions.customers where id=v_q.customer_id), v_q.customer_phone);

  v_res := exhibitions.create_wholesale_order(v_name, v_phone, p_warehouse_id, p_payment_method, v_items);
  v_order := (v_res->>'order_id')::uuid;

  update exhibitions.quotations set status='converted', converted_order_id=v_order where id=p_id;
  if v_q.lead_id is not null then
    update exhibitions.leads set stage='won', updated_at=now() where id=v_q.lead_id and tenant_id=v_t;
  end if;

  return json_build_object('order_id', v_order, 'total', v_res->'total', 'quote_id', p_id);
end $$;

-- ============================================================
-- 6) لوحة CRM (ملخّص المسار + العروض)
-- ============================================================
create or replace function exhibitions.crm_dashboard()
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._crm_tenant();
begin
  return json_build_object(
    'pipeline', (select coalesce(json_agg(row_to_json(x) order by x.ord),'[]') from (
        select s.stage, s.ord,
          coalesce((select count(*) from exhibitions.leads l where l.tenant_id=v_t and l.stage=s.stage),0) as count,
          coalesce((select sum(est_value) from exhibitions.leads l where l.tenant_id=v_t and l.stage=s.stage),0) as value
        from (values ('new',1),('contacted',2),('qualified',3),('proposal',4),('won',5),('lost',6)) s(stage,ord)) x),
    'open_quotes', coalesce((select count(*) from exhibitions.quotations q where q.tenant_id=v_t and q.status in ('draft','sent')),0),
    'open_quotes_value', coalesce((select sum(total_sar) from exhibitions.quotations q where q.tenant_id=v_t and q.status in ('draft','sent')),0),
    'won_this_month', coalesce((select count(*) from exhibitions.leads l where l.tenant_id=v_t and l.stage='won'
        and l.updated_at >= date_trunc('month', now())),0),
    'converted_this_month', coalesce((select sum(total_sar) from exhibitions.quotations q where q.tenant_id=v_t
        and q.status='converted' and q.created_at >= date_trunc('month', now())),0)
  );
end $$;

-- 7) المنح
grant execute on function exhibitions.leads_list(text) to authenticated;
grant execute on function exhibitions.lead_set(uuid,text,text,text,text,text,text,numeric,uuid,text) to authenticated;
grant execute on function exhibitions.lead_set_stage(uuid,text) to authenticated;
grant execute on function exhibitions.lead_delete(uuid) to authenticated;
grant execute on function exhibitions.lead_convert_customer(uuid) to authenticated;
grant execute on function exhibitions.quotations_list(text) to authenticated;
grant execute on function exhibitions.quotation_get(uuid) to authenticated;
grant execute on function exhibitions.quotation_set(uuid,uuid,uuid,text,text,date,numeric,text,jsonb) to authenticated;
grant execute on function exhibitions.quotation_set_status(uuid,text) to authenticated;
grant execute on function exhibitions.quotation_convert(uuid,uuid,text) to authenticated;
grant execute on function exhibitions.crm_dashboard() to authenticated;
