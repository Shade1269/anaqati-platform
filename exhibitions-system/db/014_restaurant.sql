-- ============================================================
-- المرحلة 3: نظام المطاعم والكافيهات (White-label) | Migration 014
-- يعيد استخدام محرّك المحاسبة (_post)، تعدد العملاء (tenant_id/RLS)،
-- والأدوار (admin/inventory_manager/employee). يضيف نوع النشاط +
-- المنيو + الطاولات + جلسات الطاولات + الطلبات (مطبخ KDS + إضافات).
--
-- نموذج البيانات: مشترك نوعه restaurant → عنده طاولات + منيو. النادل
-- (employee بالتوكن) يفتح طاولة ويضيف طلبات → تطلع للمطبخ. الكاشير
-- (admin أو مدير بصلاحية can_manage_restaurant) يقفل الفاتورة → قيد
-- محاسبي تلقائي (نقد/شبكة مدين، إيرادات مطعم 4040 دائن) وتتفرّغ الطاولة.
-- ============================================================

-- نوع النشاط على العميل (تجزئة افتراضيًا)
alter table exhibitions.tenants
  add column if not exists business_type text not null default 'retail'
  check (business_type in ('retail','restaurant'));

-- تفويض إدارة المطعم للمدير (مثل can_manage_store)
alter table exhibitions.im_permissions
  add column if not exists can_manage_restaurant boolean not null default false;

-- حساب إيرادات المطعم في الدليل العام
insert into exhibitions.accounts(code,name,type,sort)
  values ('4040','إيرادات المطعم','revenue',116)
  on conflict (code) do nothing;

-- ---------- التسلسلات ----------
create sequence if not exists exhibitions.table_session_seq;
create sequence if not exists exhibitions.restaurant_order_seq;

-- ---------- الجداول ----------
create table if not exists exhibitions.menu_categories (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references exhibitions.tenants(id) on delete cascade,
  name       text not null,
  sort       int  not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists exhibitions.menu_items (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references exhibitions.tenants(id) on delete cascade,
  category_id  uuid references exhibitions.menu_categories(id) on delete set null,
  name         text not null,
  price_sar    numeric(14,2) not null default 0,
  description  text,
  image_url    text,
  is_available boolean not null default true,
  sort         int not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists exhibitions.menu_item_options (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references exhibitions.tenants(id) on delete cascade,
  item_id         uuid not null references exhibitions.menu_items(id) on delete cascade,
  group_name      text not null default 'إضافات',
  name            text not null,
  price_delta_sar numeric(14,2) not null default 0,
  sort            int not null default 0
);

create table if not exists exhibitions.dining_tables (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references exhibitions.tenants(id) on delete cascade,
  label      text not null,
  section    text,
  seats      int not null default 4,
  status     text not null default 'free' check (status in ('free','open','billing')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists exhibitions.table_sessions (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references exhibitions.tenants(id) on delete cascade,
  table_id       uuid not null references exhibitions.dining_tables(id) on delete restrict,
  session_no     text not null default ('TS-'||lpad(nextval('exhibitions.table_session_seq')::text,6,'0')),
  status         text not null default 'open' check (status in ('open','billing','paid','void')),
  guest_count    int not null default 1,
  opened_by      uuid references exhibitions.profiles(id) on delete set null,
  closed_by      uuid references exhibitions.profiles(id) on delete set null,
  total_sar      numeric(14,2) not null default 0,
  payment_method exhibitions.payment_method,
  opened_at      timestamptz not null default now(),
  closed_at      timestamptz
);

create table if not exists exhibitions.orders (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references exhibitions.tenants(id) on delete cascade,
  session_id uuid not null references exhibitions.table_sessions(id) on delete cascade,
  order_no   text not null default ('OR-'||lpad(nextval('exhibitions.restaurant_order_seq')::text,6,'0')),
  status     text not null default 'new' check (status in ('new','preparing','ready','served','cancelled')),
  created_by uuid references exhibitions.profiles(id) on delete set null,
  note       text,
  created_at timestamptz not null default now()
);

create table if not exists exhibitions.order_items (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references exhibitions.tenants(id) on delete cascade,
  order_id      uuid not null references exhibitions.orders(id) on delete cascade,
  menu_item_id  uuid not null references exhibitions.menu_items(id) on delete restrict,
  name_snapshot text not null,
  qty           int not null check (qty>0),
  unit_price_sar numeric(14,2) not null,
  options       jsonb not null default '[]',
  line_total_sar numeric(14,2) not null,
  note          text
);

-- ---------- الختم التلقائي + الفهارس + RLS ----------
do $$
declare t text;
  tbls text[] := array['menu_categories','menu_items','menu_item_options',
    'dining_tables','table_sessions','orders','order_items'];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_set_tenant on exhibitions.%I', t);
    execute format('create trigger trg_set_tenant before insert on exhibitions.%I for each row execute function exhibitions._set_tenant()', t);
    execute format('create index if not exists idx_%s_tenant on exhibitions.%I(tenant_id)', t, t);
    execute format('alter table exhibitions.%I enable row level security', t);
    -- الأدمن: كل شيء داخل عميله
    execute format('drop policy if exists admin_all on exhibitions.%I', t);
    execute format('create policy admin_all on exhibitions.%I for all to authenticated using (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id())', t);
    -- المدير المفوّض بإدارة المطعم
    execute format('drop policy if exists mgr_rest on exhibitions.%I', t);
    execute format('create policy mgr_rest on exhibitions.%I for all to authenticated using (exhibitions._im_can(''can_manage_restaurant'') and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions._im_can(''can_manage_restaurant'') and tenant_id=exhibitions.current_tenant_id())', t);
    execute format('grant select,insert,update,delete on exhibitions.%I to authenticated', t);
    execute format('grant all on exhibitions.%I to service_role', t);
  end loop;
end $$;

create index if not exists idx_menu_items_cat on exhibitions.menu_items(category_id);
create index if not exists idx_orders_session on exhibitions.orders(session_id);
create index if not exists idx_order_items_order on exhibitions.order_items(order_id);
create index if not exists idx_table_sessions_table on exhibitions.table_sessions(table_id);

-- ============================================================
-- سياق التشغيل: يحلّ (المنفّذ، العميل) من توكن الموظف أو من جلسة الأدمن/المدير
-- p_token != null  → نادل/مطبخ (employee) ؛ يضبط العميل من التوكن
-- p_token = null   → admin أو مدير بصلاحية can_manage_restaurant
-- ============================================================
create or replace function exhibitions._rest_ctx(p_token uuid, out v_actor uuid, out v_tenant uuid)
language plpgsql security definer set search_path=exhibitions,public as $$
begin
  if p_token is not null then
    v_actor := exhibitions._employee_from_token(p_token); -- يضبط config العميل
    select tenant_id into v_tenant from exhibitions.profiles where id=v_actor;
  else
    if not (exhibitions.is_admin() or exhibitions._im_can('can_manage_restaurant')) then
      raise exception 'غير مصرّح';
    end if;
    v_actor := exhibitions.current_profile_id();
    v_tenant := exhibitions.current_tenant_id();
  end if;
  perform set_config('exhibitions.current_tenant', v_tenant::text, true);
end $$;
revoke execute on function exhibitions._rest_ctx(uuid) from public, anon, authenticated;

-- ============================================================
-- إدارة المنيو والطاولات (admin أو مدير بصلاحية) — بدون توكن
-- ============================================================
create or replace function exhibitions._rest_can_manage() returns void
language plpgsql stable security definer set search_path=exhibitions,public as $$
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_manage_restaurant')) then
    raise exception 'غير مصرّح';
  end if;
end $$;
revoke execute on function exhibitions._rest_can_manage() from public, anon, authenticated;

create or replace function exhibitions.menu_set_category(p_id uuid, p_name text, p_sort int default 0, p_active boolean default true)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_id uuid; v_t uuid := exhibitions.current_tenant_id();
begin
  perform exhibitions._rest_can_manage();
  if p_id is null then
    insert into exhibitions.menu_categories(tenant_id,name,sort,is_active) values(v_t,p_name,coalesce(p_sort,0),coalesce(p_active,true)) returning id into v_id;
  else
    update exhibitions.menu_categories set name=p_name, sort=coalesce(p_sort,0), is_active=coalesce(p_active,true)
      where id=p_id and tenant_id=v_t returning id into v_id;
    if v_id is null then raise exception 'القسم غير موجود'; end if;
  end if;
  return v_id;
end $$;

create or replace function exhibitions.menu_set_item(
  p_id uuid, p_category_id uuid, p_name text, p_price numeric,
  p_description text default null, p_image_url text default null,
  p_available boolean default true, p_sort int default 0)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_id uuid; v_t uuid := exhibitions.current_tenant_id();
begin
  perform exhibitions._rest_can_manage();
  if p_id is null then
    insert into exhibitions.menu_items(tenant_id,category_id,name,price_sar,description,image_url,is_available,sort)
      values(v_t,p_category_id,p_name,coalesce(p_price,0),p_description,p_image_url,coalesce(p_available,true),coalesce(p_sort,0))
      returning id into v_id;
  else
    update exhibitions.menu_items set category_id=p_category_id, name=p_name, price_sar=coalesce(p_price,0),
        description=p_description, image_url=p_image_url, is_available=coalesce(p_available,true), sort=coalesce(p_sort,0)
      where id=p_id and tenant_id=v_t returning id into v_id;
    if v_id is null then raise exception 'الصنف غير موجود'; end if;
  end if;
  return v_id;
end $$;

create or replace function exhibitions.menu_delete_item(p_id uuid)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
begin
  perform exhibitions._rest_can_manage();
  delete from exhibitions.menu_items where id=p_id and tenant_id=exhibitions.current_tenant_id();
end $$;

create or replace function exhibitions.menu_set_option(p_id uuid, p_item_id uuid, p_group text, p_name text, p_delta numeric, p_sort int default 0)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_id uuid; v_t uuid := exhibitions.current_tenant_id();
begin
  perform exhibitions._rest_can_manage();
  if not exists(select 1 from exhibitions.menu_items where id=p_item_id and tenant_id=v_t) then raise exception 'الصنف غير موجود'; end if;
  if p_id is null then
    insert into exhibitions.menu_item_options(tenant_id,item_id,group_name,name,price_delta_sar,sort)
      values(v_t,p_item_id,coalesce(nullif(p_group,''),'إضافات'),p_name,coalesce(p_delta,0),coalesce(p_sort,0)) returning id into v_id;
  else
    update exhibitions.menu_item_options set group_name=coalesce(nullif(p_group,''),'إضافات'), name=p_name, price_delta_sar=coalesce(p_delta,0), sort=coalesce(p_sort,0)
      where id=p_id and tenant_id=v_t returning id into v_id;
    if v_id is null then raise exception 'الخيار غير موجود'; end if;
  end if;
  return v_id;
end $$;

create or replace function exhibitions.menu_delete_option(p_id uuid)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
begin
  perform exhibitions._rest_can_manage();
  delete from exhibitions.menu_item_options where id=p_id and tenant_id=exhibitions.current_tenant_id();
end $$;

create or replace function exhibitions.table_set(p_id uuid, p_label text, p_section text default null, p_seats int default 4, p_active boolean default true)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_id uuid; v_t uuid := exhibitions.current_tenant_id();
begin
  perform exhibitions._rest_can_manage();
  if p_id is null then
    insert into exhibitions.dining_tables(tenant_id,label,section,seats,is_active)
      values(v_t,p_label,p_section,coalesce(p_seats,4),coalesce(p_active,true)) returning id into v_id;
  else
    update exhibitions.dining_tables set label=p_label, section=p_section, seats=coalesce(p_seats,4), is_active=coalesce(p_active,true)
      where id=p_id and tenant_id=v_t returning id into v_id;
    if v_id is null then raise exception 'الطاولة غير موجودة'; end if;
  end if;
  return v_id;
end $$;

-- ============================================================
-- قراءات: المنيو الكامل + خريطة الطاولات (للأدمن/المدير/النادل بالتوكن)
-- ============================================================
create or replace function exhibitions.restaurant_menu(p_token uuid default null)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_actor uuid; v_tenant uuid;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  return (select coalesce(json_agg(json_build_object(
      'id',c.id,'name',c.name,'sort',c.sort,'is_active',c.is_active,
      'items',(select coalesce(json_agg(json_build_object(
          'id',i.id,'name',i.name,'price',i.price_sar,'description',i.description,'image_url',i.image_url,
          'is_available',i.is_available,'sort',i.sort,
          'options',(select coalesce(json_agg(json_build_object('id',o.id,'group',o.group_name,'name',o.name,'price_delta',o.price_delta_sar) order by o.sort,o.name),'[]')
             from exhibitions.menu_item_options o where o.item_id=i.id)
        ) order by i.sort,i.name),'[]')
        from exhibitions.menu_items i where i.category_id=c.id and i.tenant_id=v_tenant)
    ) order by c.sort,c.name),'[]')
    from exhibitions.menu_categories c where c.tenant_id=v_tenant);
end $$;

create or replace function exhibitions.restaurant_tables(p_token uuid default null)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_actor uuid; v_tenant uuid;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  return (select coalesce(json_agg(json_build_object(
      'id',d.id,'label',d.label,'section',d.section,'seats',d.seats,'status',d.status,'is_active',d.is_active,
      'sessions',(select coalesce(json_agg(json_build_object(
          'id',s.id,'session_no',s.session_no,'total',s.total_sar,'guest_count',s.guest_count,'opened_at',s.opened_at) order by s.opened_at),'[]')
        from exhibitions.table_sessions s where s.table_id=d.id and s.status in ('open','billing'))
    ) order by d.section nulls first, d.label),'[]')
    from exhibitions.dining_tables d where d.tenant_id=v_tenant and d.is_active);
end $$;

-- ============================================================
-- التشغيل: فتح طاولة / إضافة طلب / تفاصيل الجلسة / مطبخ / إقفال / نقل-دمج-تقسيم
-- كلها تقبل p_token (نادل) أو بدونه (أدمن/مدير)
-- ============================================================
create or replace function exhibitions.open_table(p_table_id uuid, p_guests int default 1, p_token uuid default null)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_actor uuid; v_tenant uuid; v_sess uuid; v_no text;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if not exists(select 1 from exhibitions.dining_tables where id=p_table_id and tenant_id=v_tenant and is_active) then
    raise exception 'الطاولة غير موجودة';
  end if;
  select id, session_no into v_sess, v_no from exhibitions.table_sessions
    where table_id=p_table_id and tenant_id=v_tenant and status in ('open','billing')
    order by opened_at limit 1;
  if v_sess is not null then
    return json_build_object('session_id',v_sess,'session_no',v_no,'reused',true);
  end if;
  insert into exhibitions.table_sessions(tenant_id,table_id,guest_count,opened_by,status)
    values(v_tenant,p_table_id,greatest(coalesce(p_guests,1),1),v_actor,'open')
    returning id, session_no into v_sess, v_no;
  update exhibitions.dining_tables set status='open' where id=p_table_id and tenant_id=v_tenant;
  return json_build_object('session_id',v_sess,'session_no',v_no,'reused',false);
end $$;

create or replace function exhibitions.add_order(p_session_id uuid, p_items jsonb, p_note text default null, p_token uuid default null)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_actor uuid; v_tenant uuid; v_order uuid; v_no text; r jsonb; v_item exhibitions.menu_items;
        v_opts jsonb; v_opt jsonb; v_delta numeric; v_qty int; v_line numeric; v_total numeric:=0;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if not exists(select 1 from exhibitions.table_sessions where id=p_session_id and tenant_id=v_tenant and status='open') then
    raise exception 'الجلسة غير مفتوحة';
  end if;
  if p_items is null or jsonb_array_length(p_items)=0 then raise exception 'لا توجد أصناف'; end if;
  insert into exhibitions.orders(tenant_id,session_id,created_by,note,status)
    values(v_tenant,p_session_id,v_actor,p_note,'new') returning id, order_no into v_order, v_no;
  for r in select * from jsonb_array_elements(p_items) loop
    select * into v_item from exhibitions.menu_items where id=(r->>'menu_item_id')::uuid and tenant_id=v_tenant and is_available;
    if not found then raise exception 'صنف غير متاح'; end if;
    v_qty := greatest(coalesce((r->>'qty')::int,1),1);
    v_delta := 0; v_opts := coalesce(r->'options','[]'::jsonb);
    for v_opt in select * from jsonb_array_elements(v_opts) loop
      v_delta := v_delta + coalesce((v_opt->>'price_delta')::numeric,0);
    end loop;
    v_line := v_qty*(v_item.price_sar + v_delta);
    insert into exhibitions.order_items(tenant_id,order_id,menu_item_id,name_snapshot,qty,unit_price_sar,options,line_total_sar,note)
      values(v_tenant,v_order,v_item.id,v_item.name,v_qty,v_item.price_sar,v_opts,v_line,r->>'note');
    v_total := v_total + v_line;
  end loop;
  update exhibitions.table_sessions set total_sar = total_sar + v_total where id=p_session_id;
  return json_build_object('order_id',v_order,'order_no',v_no,'added',v_total);
end $$;

create or replace function exhibitions.session_detail(p_session_id uuid, p_token uuid default null)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_actor uuid; v_tenant uuid;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  return (select json_build_object(
    'session',(select row_to_json(s) from (
        select ts.id,ts.session_no,ts.status,ts.guest_count,ts.total_sar,ts.opened_at,
               dt.label as table_label, dt.section
          from exhibitions.table_sessions ts join exhibitions.dining_tables dt on dt.id=ts.table_id
         where ts.id=p_session_id and ts.tenant_id=v_tenant) s),
    'orders',(select coalesce(json_agg(json_build_object(
        'id',o.id,'order_no',o.order_no,'status',o.status,'note',o.note,'created_at',o.created_at,
        'items',(select coalesce(json_agg(json_build_object('id',oi.id,'name',oi.name_snapshot,'qty',oi.qty,
            'unit_price',oi.unit_price_sar,'options',oi.options,'line_total',oi.line_total_sar,'note',oi.note) order by oi.id),'[]')
          from exhibitions.order_items oi where oi.order_id=o.id)
      ) order by o.created_at),'[]')
      from exhibitions.orders o where o.session_id=p_session_id and o.tenant_id=v_tenant and o.status<>'cancelled')
  ));
end $$;

create or replace function exhibitions.kds_list(p_token uuid default null)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_actor uuid; v_tenant uuid;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  return (select coalesce(json_agg(json_build_object(
     'id',o.id,'order_no',o.order_no,'status',o.status,'created_at',o.created_at,'note',o.note,
     'table_label',dt.label,
     'items',(select coalesce(json_agg(json_build_object('name',oi.name_snapshot,'qty',oi.qty,'options',oi.options,'note',oi.note) order by oi.id),'[]')
        from exhibitions.order_items oi where oi.order_id=o.id)
    ) order by o.created_at),'[]')
   from exhibitions.orders o
   join exhibitions.table_sessions ts on ts.id=o.session_id
   join exhibitions.dining_tables dt on dt.id=ts.table_id
   where o.tenant_id=v_tenant and o.status in ('new','preparing','ready'));
end $$;

create or replace function exhibitions.kds_set_order_status(p_order_id uuid, p_status text, p_token uuid default null)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_actor uuid; v_tenant uuid;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if p_status not in ('new','preparing','ready','served','cancelled') then raise exception 'حالة غير صحيحة'; end if;
  update exhibitions.orders set status=p_status where id=p_order_id and tenant_id=v_tenant;
end $$;

create or replace function exhibitions.close_table_bill(p_session_id uuid, p_payment_method text default 'cash', p_token uuid default null)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_actor uuid; v_tenant uuid; v_table uuid; v_total numeric; v_cash text; v_pm exhibitions.payment_method;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  select table_id into v_table from exhibitions.table_sessions
    where id=p_session_id and tenant_id=v_tenant and status in ('open','billing');
  if not found then raise exception 'الجلسة غير موجودة أو مقفلة مسبقًا'; end if;
  v_pm := coalesce(nullif(p_payment_method,''),'cash')::exhibitions.payment_method;
  select coalesce(sum(oi.line_total_sar),0) into v_total
    from exhibitions.order_items oi join exhibitions.orders o on o.id=oi.order_id
    where o.session_id=p_session_id and o.tenant_id=v_tenant and o.status<>'cancelled';
  v_cash := case when v_pm='card' then '1020' else '1010' end;
  if v_total > 0 then
    perform exhibitions._post(current_date,'فاتورة مطعم','table_sessions',p_session_id,
      jsonb_build_array(
        jsonb_build_object('account',v_cash,'debit',v_total,'credit',0),
        jsonb_build_object('account','4040','debit',0,'credit',v_total)));
  end if;
  update exhibitions.table_sessions
    set status='paid', total_sar=v_total, payment_method=v_pm, closed_by=v_actor, closed_at=now()
    where id=p_session_id;
  update exhibitions.orders set status='served'
    where session_id=p_session_id and tenant_id=v_tenant and status in ('new','preparing','ready');
  update exhibitions.dining_tables set status='free' where id=v_table and tenant_id=v_tenant;
  return json_build_object('session_id',p_session_id,'total',v_total,'payment_method',v_pm);
end $$;

create or replace function exhibitions.transfer_table(p_session_id uuid, p_to_table_id uuid, p_token uuid default null)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_actor uuid; v_tenant uuid; v_from uuid;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if exists(select 1 from exhibitions.table_sessions where table_id=p_to_table_id and tenant_id=v_tenant and status in ('open','billing')) then
    raise exception 'الطاولة الهدف مشغولة';
  end if;
  select table_id into v_from from exhibitions.table_sessions where id=p_session_id and tenant_id=v_tenant and status in ('open','billing');
  if not found then raise exception 'الجلسة غير موجودة'; end if;
  update exhibitions.table_sessions set table_id=p_to_table_id where id=p_session_id;
  update exhibitions.dining_tables set status='open' where id=p_to_table_id and tenant_id=v_tenant;
  update exhibitions.dining_tables set status='free' where id=v_from and tenant_id=v_tenant
    and not exists(select 1 from exhibitions.table_sessions where table_id=v_from and tenant_id=v_tenant and status in ('open','billing'));
end $$;

create or replace function exhibitions.merge_tables(p_from_session_id uuid, p_into_session_id uuid, p_token uuid default null)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_actor uuid; v_tenant uuid; v_from_table uuid; v_from_total numeric;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if p_from_session_id = p_into_session_id then raise exception 'لا يمكن الدمج مع نفس الجلسة'; end if;
  if not exists(select 1 from exhibitions.table_sessions where id=p_into_session_id and tenant_id=v_tenant and status='open') then
    raise exception 'الجلسة الهدف غير مفتوحة';
  end if;
  select table_id, total_sar into v_from_table, v_from_total from exhibitions.table_sessions
    where id=p_from_session_id and tenant_id=v_tenant and status in ('open','billing');
  if not found then raise exception 'الجلسة المصدر غير موجودة'; end if;
  update exhibitions.orders set session_id=p_into_session_id where session_id=p_from_session_id and tenant_id=v_tenant;
  update exhibitions.table_sessions set total_sar = total_sar + coalesce(v_from_total,0) where id=p_into_session_id;
  update exhibitions.table_sessions set status='void', total_sar=0, closed_by=v_actor, closed_at=now() where id=p_from_session_id;
  update exhibitions.dining_tables set status='free' where id=v_from_table and tenant_id=v_tenant
    and not exists(select 1 from exhibitions.table_sessions where table_id=v_from_table and tenant_id=v_tenant and status in ('open','billing'));
end $$;

-- تقسيم الفاتورة: نقل أصناف مختارة إلى جلسة جديدة على نفس الطاولة (فاتورة منفصلة)
create or replace function exhibitions.split_session(p_session_id uuid, p_item_ids uuid[], p_token uuid default null)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_actor uuid; v_tenant uuid; v_table uuid; v_new uuid; v_no text; v_new_order uuid;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  if p_item_ids is null or array_length(p_item_ids,1) is null then raise exception 'لم تُحدّد أصناف'; end if;
  select table_id into v_table from exhibitions.table_sessions where id=p_session_id and tenant_id=v_tenant and status='open';
  if not found then raise exception 'الجلسة غير مفتوحة'; end if;
  insert into exhibitions.table_sessions(tenant_id,table_id,guest_count,opened_by,status)
    values(v_tenant,v_table,1,v_actor,'open') returning id, session_no into v_new, v_no;
  insert into exhibitions.orders(tenant_id,session_id,created_by,status,note)
    values(v_tenant,v_new,v_actor,'served','أصناف مقسومة') returning id into v_new_order;
  update exhibitions.order_items set order_id=v_new_order
    where id = any(p_item_ids) and tenant_id=v_tenant
      and order_id in (select id from exhibitions.orders where session_id=p_session_id and tenant_id=v_tenant);
  if not found then raise exception 'تعذّر نقل الأصناف'; end if;
  -- إعادة احتساب المجموعين
  update exhibitions.table_sessions ts set total_sar = coalesce((
      select sum(oi.line_total_sar) from exhibitions.order_items oi join exhibitions.orders o on o.id=oi.order_id
      where o.session_id=ts.id and o.status<>'cancelled'),0)
    where ts.id in (p_session_id, v_new);
  return json_build_object('new_session_id',v_new,'new_session_no',v_no);
end $$;

-- ============================================================
-- تحديث my_profile: business_type + كل أعلام الصلاحيات (لتوجيه الواجهة)
-- ============================================================
create or replace function exhibitions.my_profile()
returns json language sql stable security definer set search_path=exhibitions,public as $$
  select json_build_object(
    'id',pr.id,'full_name',pr.full_name,'role',pr.role,'status',pr.status,
    'tenant_id',pr.tenant_id,
    'is_platform_admin', exhibitions.is_platform_admin(),
    'tenant', (select row_to_json(t) from (
        select id,name,brand_name,logo_url,primary_color,status,subscription_status,subscription_expires_at,business_type
          from exhibitions.tenants where id=pr.tenant_id) t),
    'permissions',(select row_to_json(x) from (
       select can_add_stock,can_approve_requests,can_issue_transfers,can_issue_wholesale,can_receive_returns,
              can_manage_employees,can_manage_store,can_manage_restaurant
         from exhibitions.im_permissions where profile_id=pr.id) x)
  ) from exhibitions.profiles pr where pr.auth_user_id=auth.uid();
$$;

-- ============================================================
-- المنصّة: نوع النشاط عند إنشاء المشترك + إظهاره بالقائمة
-- ============================================================
drop function if exists exhibitions.create_tenant(text,text,text,text,text,date);
create or replace function exhibitions.create_tenant(
  p_name text, p_admin_email text, p_admin_password text,
  p_brand_name text default null, p_primary_color text default '#C9A24B',
  p_subscription_expires date default null, p_business_type text default 'retail')
returns json language plpgsql security definer set search_path=exhibitions,public,extensions as $$
declare v_t uuid; v_uid uuid; v_pid uuid; v_email text := lower(trim(p_admin_email));
        v_btype text := case when p_business_type='restaurant' then 'restaurant' else 'retail' end;
begin
  if not exhibitions.is_platform_admin() then raise exception 'غير مصرّح'; end if;
  if exists(select 1 from auth.users where email=v_email) then raise exception 'البريد الإلكتروني مستخدم مسبقًا'; end if;
  insert into exhibitions.tenants(name,brand_name,primary_color,subscription_expires_at,business_type)
    values(p_name, coalesce(nullif(p_brand_name,''),p_name), coalesce(p_primary_color,'#C9A24B'), p_subscription_expires, v_btype) returning id into v_t;
  v_uid := gen_random_uuid();
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,
     raw_app_meta_data,raw_user_meta_data,is_super_admin,confirmation_token,email_change,email_change_token_new,recovery_token)
   values('00000000-0000-0000-0000-000000000000',v_uid,'authenticated','authenticated',v_email,
     extensions.crypt(p_admin_password, extensions.gen_salt('bf')),now(),now(),now(),
     '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,false,'','','','');
  insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
   values(gen_random_uuid(),v_email,v_uid,json_build_object('sub',v_uid::text,'email',v_email,'email_verified',true)::jsonb,'email',now(),now(),now());
  insert into exhibitions.profiles(auth_user_id,full_name,role,status,tenant_id)
    values(v_uid, p_name||' - مدير', 'admin','active', v_t) returning id into v_pid;
  return json_build_object('tenant_id',v_t,'admin_email',v_email,'profile_id',v_pid,'business_type',v_btype);
end $$;

create or replace function exhibitions.platform_list_tenants()
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
begin
  if not exhibitions.is_platform_admin() then raise exception 'غير مصرّح'; end if;
  return coalesce((select json_agg(row_to_json(t) order by t.created_at) from (
    select tn.id,tn.name,tn.brand_name,tn.primary_color,tn.status,tn.subscription_status,tn.subscription_expires_at,tn.created_at,
      tn.business_type,
      (select count(*) from exhibitions.profiles p where p.tenant_id=tn.id and p.role='employee') as employees,
      (select count(*) from exhibitions.branches b where b.tenant_id=tn.id) as branches,
      (select coalesce(sum(total_sar),0) from exhibitions.sales s where s.tenant_id=tn.id and s.status='completed') as sales_total,
      (select u.email from auth.users u join exhibitions.profiles pa on pa.auth_user_id=u.id
        where pa.tenant_id=tn.id and pa.role='admin' order by pa.created_at limit 1) as admin_email
    from exhibitions.tenants tn) t),'[]');
end $$;

-- إضافة can_manage_restaurant إلى set_im_permissions (مع إبقاء التوقيع القديم متاحًا)
create or replace function exhibitions.set_im_permissions(
  p_profile_id uuid, p_add_stock boolean, p_approve boolean, p_transfers boolean,
  p_wholesale boolean, p_returns boolean, p_manage_employees boolean default false,
  p_manage_store boolean default false, p_manage_restaurant boolean default false)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  if not exists(select 1 from exhibitions.profiles where id=p_profile_id and tenant_id=exhibitions.current_tenant_id()) then raise exception 'المستخدم غير موجود'; end if;
  insert into exhibitions.im_permissions(profile_id,can_add_stock,can_approve_requests,can_issue_transfers,can_issue_wholesale,can_receive_returns,can_manage_employees,can_manage_store,can_manage_restaurant,updated_at)
    values(p_profile_id,p_add_stock,p_approve,p_transfers,p_wholesale,p_returns,p_manage_employees,p_manage_store,p_manage_restaurant,now())
  on conflict (profile_id) do update set can_add_stock=excluded.can_add_stock, can_approve_requests=excluded.can_approve_requests,
    can_issue_transfers=excluded.can_issue_transfers, can_issue_wholesale=excluded.can_issue_wholesale, can_receive_returns=excluded.can_receive_returns,
    can_manage_employees=excluded.can_manage_employees, can_manage_store=excluded.can_manage_store, can_manage_restaurant=excluded.can_manage_restaurant, updated_at=now();
end $$;

-- ============================================================
-- المنح (admin/manager = authenticated ؛ النادل/المطبخ = anon بالتوكن)
-- ============================================================
grant execute on function exhibitions.menu_set_category(uuid,text,int,boolean) to authenticated;
grant execute on function exhibitions.menu_set_item(uuid,uuid,text,numeric,text,text,boolean,int) to authenticated;
grant execute on function exhibitions.menu_delete_item(uuid) to authenticated;
grant execute on function exhibitions.menu_set_option(uuid,uuid,text,text,numeric,int) to authenticated;
grant execute on function exhibitions.menu_delete_option(uuid) to authenticated;
grant execute on function exhibitions.table_set(uuid,text,text,int,boolean) to authenticated;
grant execute on function exhibitions.set_im_permissions(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;
grant execute on function exhibitions.create_tenant(text,text,text,text,text,date,text) to authenticated;
grant execute on function exhibitions.platform_list_tenants() to authenticated;

grant execute on function exhibitions.restaurant_menu(uuid) to anon, authenticated;
grant execute on function exhibitions.restaurant_tables(uuid) to anon, authenticated;
grant execute on function exhibitions.open_table(uuid,int,uuid) to anon, authenticated;
grant execute on function exhibitions.add_order(uuid,jsonb,text,uuid) to anon, authenticated;
grant execute on function exhibitions.session_detail(uuid,uuid) to anon, authenticated;
grant execute on function exhibitions.kds_list(uuid) to anon, authenticated;
grant execute on function exhibitions.kds_set_order_status(uuid,text,uuid) to anon, authenticated;
grant execute on function exhibitions.close_table_bill(uuid,text,uuid) to anon, authenticated;
grant execute on function exhibitions.transfer_table(uuid,uuid,uuid) to anon, authenticated;
grant execute on function exhibitions.merge_tables(uuid,uuid,uuid) to anon, authenticated;
grant execute on function exhibitions.split_session(uuid,uuid[],uuid) to anon, authenticated;

-- ============================================================
-- employee_login يعيد business_type (لتوجيه تطبيق الموظف: نادل مطعم أو بائع تجزئة)
-- ============================================================
create or replace function exhibitions.employee_login(p_phone text, p_access_code text)
returns json language plpgsql security definer set search_path to 'exhibitions','public' as $function$
declare v_profile exhibitions.profiles; v_token uuid; v_btype text;
begin
  select pr.* into v_profile from exhibitions.profiles pr
    join exhibitions.employee_details ed on ed.profile_id=pr.id
   where pr.phone=p_phone and ed.access_code=p_access_code
     and pr.role='employee' and pr.status='active' and ed.is_active=true;
  if not found then raise exception 'بيانات الدخول غير صحيحة'; end if;
  perform set_config('exhibitions.current_tenant', v_profile.tenant_id::text, true);
  insert into exhibitions.employee_sessions(profile_id, tenant_id) values(v_profile.id, v_profile.tenant_id) returning token into v_token;
  select business_type into v_btype from exhibitions.tenants where id=v_profile.tenant_id;
  return json_build_object('token',v_token,'profile_id',v_profile.id,'full_name',v_profile.full_name,'business_type',coalesce(v_btype,'retail'));
end $function$;
