-- ============================================================
-- وحدة التصنيع الأساسية (Manufacturing / Job-Shop) | Migration 018
-- نمط تكلفة أمر الشغل (job-order costing) المؤكّد بحثيًا، مشترك لكل
-- القطاعات الصناعية (بلاستيك/خشب/معادن): BOM + مسارات/محطات عمل +
-- أوامر شغل (عرض سعر→إصدار→تنفيذ→إنجاز→فوترة) + تسعير (مواد+عمالة+
-- أوفرهيد+هامش) + تكلفة مقدّرة مقابل فعلية.
-- المحاسبة: تكلفة المواد تُرحّل عند الصرف (5010/1100)؛ الإيراد عند
-- الفوترة (نقد/شبكة/ذمم → 4060). العمالة/الأوفرهيد للتسعير فقط (الأجور
-- تُرحّل عبر الرواتب) لتفادي الازدواج.
-- ============================================================

alter table exhibitions.tenants drop constraint if exists tenants_business_type_check;
alter table exhibitions.tenants add constraint tenants_business_type_check
  check (business_type in ('retail','restaurant','manufacturing'));

alter table exhibitions.im_permissions
  add column if not exists can_manage_manufacturing boolean not null default false;

insert into exhibitions.accounts(code,name,type,sort)
  values ('4060','إيرادات التصنيع','revenue',118)
  on conflict (code) do nothing;

create sequence if not exists exhibitions.mfg_wo_seq;

-- ---------- الجداول ----------
create table if not exists exhibitions.work_centers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references exhibitions.tenants(id) on delete cascade,
  name text not null,
  hourly_rate numeric(14,4) not null default 0,   -- سعر ساعة المحطة (أوفرهيد/مكنة)
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists exhibitions.mfg_materials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references exhibitions.tenants(id) on delete cascade,
  name text not null,
  unit text not null default 'قطعة',
  current_qty numeric(14,3) not null default 0,
  reorder_level numeric(14,3) not null default 0,
  cost_per_unit numeric(14,4) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists exhibitions.mfg_material_moves (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references exhibitions.tenants(id) on delete cascade,
  material_id uuid not null references exhibitions.mfg_materials(id) on delete cascade,
  delta numeric(14,3) not null,
  reason text not null check (reason in ('purchase','issue','adjustment','waste')),
  ref_table text, ref_id uuid, note text,
  created_by uuid references exhibitions.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists exhibitions.mfg_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references exhibitions.tenants(id) on delete cascade,
  name text not null,
  unit text not null default 'قطعة',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists exhibitions.mfg_bom (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references exhibitions.tenants(id) on delete cascade,
  product_id uuid not null references exhibitions.mfg_products(id) on delete cascade,
  material_id uuid not null references exhibitions.mfg_materials(id) on delete cascade,
  qty numeric(14,3) not null check (qty > 0),
  unique (product_id, material_id)
);

create table if not exists exhibitions.mfg_routing (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references exhibitions.tenants(id) on delete cascade,
  product_id uuid not null references exhibitions.mfg_products(id) on delete cascade,
  seq int not null default 0,
  operation text not null,
  work_center_id uuid references exhibitions.work_centers(id) on delete set null,
  run_minutes numeric(14,2) not null default 0,
  labor_rate numeric(14,4) not null default 0     -- أجر ساعة العامل لهذه العملية
);

create table if not exists exhibitions.mfg_work_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references exhibitions.tenants(id) on delete cascade,
  wo_no text not null default ('WO-'||lpad(nextval('exhibitions.mfg_wo_seq')::text,6,'0')),
  product_id uuid references exhibitions.mfg_products(id) on delete set null,
  product_name text not null,
  qty numeric(14,3) not null default 1,
  customer_name text,
  status text not null default 'quote' check (status in ('quote','released','in_progress','done','invoiced','cancelled')),
  markup_pct numeric(9,2) not null default 0,
  est_material numeric(14,2) not null default 0,
  est_labor numeric(14,2) not null default 0,
  est_overhead numeric(14,2) not null default 0,
  est_total numeric(14,2) not null default 0,
  price numeric(14,2) not null default 0,
  actual_material numeric(14,2) not null default 0,
  actual_labor numeric(14,2) not null default 0,
  actual_overhead numeric(14,2) not null default 0,
  payment_method text,
  note text,
  created_by uuid references exhibitions.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  done_at timestamptz, invoiced_at timestamptz
);

create table if not exists exhibitions.mfg_wo_materials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references exhibitions.tenants(id) on delete cascade,
  work_order_id uuid not null references exhibitions.mfg_work_orders(id) on delete cascade,
  material_id uuid references exhibitions.mfg_materials(id) on delete set null,
  name_snapshot text not null,
  qty numeric(14,3) not null,
  unit_cost numeric(14,4) not null,
  line_cost numeric(14,2) not null,
  created_by uuid references exhibitions.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists exhibitions.mfg_wo_labor (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references exhibitions.tenants(id) on delete cascade,
  work_order_id uuid not null references exhibitions.mfg_work_orders(id) on delete cascade,
  work_center_id uuid references exhibitions.work_centers(id) on delete set null,
  operation text,
  minutes numeric(14,2) not null,
  labor_rate numeric(14,4) not null,
  labor_cost numeric(14,2) not null,
  overhead_cost numeric(14,2) not null,
  employee_id uuid references exhibitions.profiles(id) on delete set null,
  created_by uuid references exhibitions.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- ختم تلقائي + فهارس + RLS ----------
do $$
declare t text;
  tbls text[] := array['work_centers','mfg_materials','mfg_material_moves','mfg_products',
    'mfg_bom','mfg_routing','mfg_work_orders','mfg_wo_materials','mfg_wo_labor'];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_set_tenant on exhibitions.%I', t);
    execute format('create trigger trg_set_tenant before insert on exhibitions.%I for each row execute function exhibitions._set_tenant()', t);
    execute format('create index if not exists idx_%s_tenant on exhibitions.%I(tenant_id)', t, t);
    execute format('alter table exhibitions.%I enable row level security', t);
    execute format('drop policy if exists admin_all on exhibitions.%I', t);
    execute format('create policy admin_all on exhibitions.%I for all to authenticated using (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id())', t);
    execute format('drop policy if exists mgr_mfg on exhibitions.%I', t);
    execute format('create policy mgr_mfg on exhibitions.%I for all to authenticated using (exhibitions._im_can(''can_manage_manufacturing'') and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions._im_can(''can_manage_manufacturing'') and tenant_id=exhibitions.current_tenant_id())', t);
    execute format('grant select,insert,update,delete on exhibitions.%I to authenticated', t);
    execute format('grant all on exhibitions.%I to service_role', t);
  end loop;
end $$;
create index if not exists idx_mfg_bom_product on exhibitions.mfg_bom(product_id);
create index if not exists idx_mfg_routing_product on exhibitions.mfg_routing(product_id);
create index if not exists idx_mfg_wo_status on exhibitions.mfg_work_orders(status);

-- ---------- سياق الصلاحية ----------
create or replace function exhibitions._mfg_tenant() returns uuid
language plpgsql stable security definer set search_path=exhibitions,public as $$
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_manage_manufacturing')) then raise exception 'غير مصرّح'; end if;
  return exhibitions.current_tenant_id();
end $$;
revoke execute on function exhibitions._mfg_tenant() from public, anon, authenticated;

-- ---------- المواد ----------
create or replace function exhibitions.mfg_material_set(p_id uuid, p_name text, p_unit text, p_reorder numeric, p_cost numeric, p_active boolean default true)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant(); v_id uuid;
begin
  if p_id is null then
    insert into exhibitions.mfg_materials(tenant_id,name,unit,reorder_level,cost_per_unit,is_active)
      values(v_t,p_name,coalesce(nullif(p_unit,''),'قطعة'),coalesce(p_reorder,0),coalesce(p_cost,0),coalesce(p_active,true)) returning id into v_id;
  else
    update exhibitions.mfg_materials set name=p_name,unit=coalesce(nullif(p_unit,''),'قطعة'),reorder_level=coalesce(p_reorder,0),
      cost_per_unit=coalesce(p_cost,cost_per_unit),is_active=coalesce(p_active,true) where id=p_id and tenant_id=v_t returning id into v_id;
    if v_id is null then raise exception 'المادة غير موجودة'; end if;
  end if; return v_id;
end $$;

create or replace function exhibitions.mfg_material_receive(p_material_id uuid, p_qty numeric, p_unit_cost numeric, p_payment_method text default 'cash', p_note text default null)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant(); v_actor uuid := exhibitions.current_profile_id();
        v_q numeric; v_c numeric; v_nq numeric; v_nc numeric; v_amt numeric; v_cash text; v_move uuid; v_pm exhibitions.payment_method;
begin
  if coalesce(p_qty,0)<=0 then raise exception 'كمية غير صحيحة'; end if;
  select current_qty,cost_per_unit into v_q,v_c from exhibitions.mfg_materials where id=p_material_id and tenant_id=v_t;
  if not found then raise exception 'المادة غير موجودة'; end if;
  v_nq:=v_q+p_qty; v_nc:=case when v_nq>0 then ((v_q*coalesce(v_c,0))+(p_qty*coalesce(p_unit_cost,0)))/v_nq else coalesce(p_unit_cost,0) end;
  update exhibitions.mfg_materials set current_qty=v_nq,cost_per_unit=v_nc where id=p_material_id and tenant_id=v_t;
  insert into exhibitions.mfg_material_moves(tenant_id,material_id,delta,reason,ref_table,note,created_by)
    values(v_t,p_material_id,p_qty,'purchase','mfg_materials',p_note,v_actor) returning id into v_move;
  v_amt:=p_qty*coalesce(p_unit_cost,0);
  if v_amt>0 then
    v_pm:=coalesce(nullif(p_payment_method,''),'cash')::exhibitions.payment_method;
    v_cash:=case when v_pm='card' then '1020' else '1010' end;
    perform exhibitions._post(current_date,'شراء مواد تصنيع','mfg_material_moves',v_move,
      jsonb_build_array(jsonb_build_object('account','1100','debit',v_amt,'credit',0),
                        jsonb_build_object('account',v_cash,'debit',0,'credit',v_amt)));
  end if;
  return json_build_object('material_id',p_material_id,'new_qty',v_nq);
end $$;

create or replace function exhibitions.mfg_material_adjust(p_material_id uuid, p_new_qty numeric, p_reason text default 'adjustment', p_note text default null)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant(); v_actor uuid := exhibitions.current_profile_id(); v_q numeric; v_c numeric; v_d numeric; v_val numeric; v_r text;
begin
  v_r := case when p_reason='waste' then 'waste' else 'adjustment' end;
  select current_qty,cost_per_unit into v_q,v_c from exhibitions.mfg_materials where id=p_material_id and tenant_id=v_t;
  if not found then raise exception 'المادة غير موجودة'; end if;
  v_d := coalesce(p_new_qty,0)-v_q; if v_d=0 then return; end if;
  update exhibitions.mfg_materials set current_qty=coalesce(p_new_qty,0) where id=p_material_id and tenant_id=v_t;
  insert into exhibitions.mfg_material_moves(tenant_id,material_id,delta,reason,ref_table,note,created_by)
    values(v_t,p_material_id,v_d,v_r,'mfg_materials',p_note,v_actor);
  v_val := abs(v_d)*coalesce(v_c,0);
  if v_val>0 then
    if v_d<0 then perform exhibitions._post(current_date,'هدر/نقص مواد تصنيع','mfg_materials',p_material_id,
      jsonb_build_array(jsonb_build_object('account','5010','debit',v_val,'credit',0),jsonb_build_object('account','1100','debit',0,'credit',v_val)));
    else perform exhibitions._post(current_date,'زيادة جرد مواد تصنيع','mfg_materials',p_material_id,
      jsonb_build_array(jsonb_build_object('account','1100','debit',v_val,'credit',0),jsonb_build_object('account','5010','debit',0,'credit',v_val)));
    end if;
  end if;
end $$;

create or replace function exhibitions.mfg_materials_list(p_low_only boolean default false)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant();
begin
  return (select coalesce(json_agg(row_to_json(x) order by (x.current_qty<=x.reorder_level) desc, x.name),'[]') from (
    select m.id,m.name,m.unit,m.current_qty,m.reorder_level,m.cost_per_unit,m.is_active,(m.current_qty<=m.reorder_level) as is_low
    from exhibitions.mfg_materials m where m.tenant_id=v_t and (not p_low_only or m.current_qty<=m.reorder_level)) x);
end $$;

-- ---------- محطات العمل ----------
create or replace function exhibitions.mfg_workcenter_set(p_id uuid, p_name text, p_rate numeric, p_active boolean default true)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant(); v_id uuid;
begin
  if p_id is null then
    insert into exhibitions.work_centers(tenant_id,name,hourly_rate,is_active) values(v_t,p_name,coalesce(p_rate,0),coalesce(p_active,true)) returning id into v_id;
  else
    update exhibitions.work_centers set name=p_name,hourly_rate=coalesce(p_rate,0),is_active=coalesce(p_active,true) where id=p_id and tenant_id=v_t returning id into v_id;
    if v_id is null then raise exception 'المحطة غير موجودة'; end if;
  end if; return v_id;
end $$;

create or replace function exhibitions.mfg_workcenters_list()
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant();
begin
  return (select coalesce(json_agg(json_build_object('id',w.id,'name',w.name,'hourly_rate',w.hourly_rate,'is_active',w.is_active) order by w.name),'[]')
    from exhibitions.work_centers w where w.tenant_id=v_t);
end $$;

-- ---------- المنتجات + BOM + المسار ----------
create or replace function exhibitions.mfg_product_set(p_id uuid, p_name text, p_unit text, p_active boolean default true)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant(); v_id uuid;
begin
  if p_id is null then
    insert into exhibitions.mfg_products(tenant_id,name,unit,is_active) values(v_t,p_name,coalesce(nullif(p_unit,''),'قطعة'),coalesce(p_active,true)) returning id into v_id;
  else
    update exhibitions.mfg_products set name=p_name,unit=coalesce(nullif(p_unit,''),'قطعة'),is_active=coalesce(p_active,true) where id=p_id and tenant_id=v_t returning id into v_id;
    if v_id is null then raise exception 'المنتج غير موجود'; end if;
  end if; return v_id;
end $$;

create or replace function exhibitions.mfg_product_delete(p_id uuid)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant();
begin delete from exhibitions.mfg_products where id=p_id and tenant_id=v_t; end $$;

create or replace function exhibitions.mfg_products_list()
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant();
begin
  return (select coalesce(json_agg(json_build_object('id',p.id,'name',p.name,'unit',p.unit,'is_active',p.is_active) order by p.name),'[]')
    from exhibitions.mfg_products p where p.tenant_id=v_t);
end $$;

create or replace function exhibitions.mfg_bom_get(p_product_id uuid)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant();
begin
  return (select coalesce(json_agg(json_build_object('id',b.id,'material_id',b.material_id,'name',m.name,'unit',m.unit,'qty',b.qty,'cost',m.cost_per_unit) order by m.name),'[]')
    from exhibitions.mfg_bom b join exhibitions.mfg_materials m on m.id=b.material_id where b.product_id=p_product_id and b.tenant_id=v_t);
end $$;

create or replace function exhibitions.mfg_bom_set(p_product_id uuid, p_items jsonb)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant(); r jsonb;
begin
  if not exists(select 1 from exhibitions.mfg_products where id=p_product_id and tenant_id=v_t) then raise exception 'المنتج غير موجود'; end if;
  delete from exhibitions.mfg_bom where product_id=p_product_id and tenant_id=v_t;
  for r in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    if coalesce((r->>'qty')::numeric,0)>0 then
      insert into exhibitions.mfg_bom(tenant_id,product_id,material_id,qty) values(v_t,p_product_id,(r->>'material_id')::uuid,(r->>'qty')::numeric)
      on conflict (product_id,material_id) do update set qty=excluded.qty;
    end if;
  end loop;
end $$;

create or replace function exhibitions.mfg_routing_get(p_product_id uuid)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant();
begin
  return (select coalesce(json_agg(json_build_object('id',r.id,'seq',r.seq,'operation',r.operation,'work_center_id',r.work_center_id,
     'work_center',w.name,'run_minutes',r.run_minutes,'labor_rate',r.labor_rate,'wc_rate',w.hourly_rate) order by r.seq),'[]')
    from exhibitions.mfg_routing r left join exhibitions.work_centers w on w.id=r.work_center_id where r.product_id=p_product_id and r.tenant_id=v_t);
end $$;

create or replace function exhibitions.mfg_routing_set(p_product_id uuid, p_ops jsonb)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant(); r jsonb; v_i int := 0;
begin
  if not exists(select 1 from exhibitions.mfg_products where id=p_product_id and tenant_id=v_t) then raise exception 'المنتج غير موجود'; end if;
  delete from exhibitions.mfg_routing where product_id=p_product_id and tenant_id=v_t;
  for r in select * from jsonb_array_elements(coalesce(p_ops,'[]'::jsonb)) loop
    v_i := v_i+1;
    insert into exhibitions.mfg_routing(tenant_id,product_id,seq,operation,work_center_id,run_minutes,labor_rate)
      values(v_t,p_product_id,v_i,coalesce(r->>'operation','عملية'),nullif(r->>'work_center_id','')::uuid,coalesce((r->>'run_minutes')::numeric,0),coalesce((r->>'labor_rate')::numeric,0));
  end loop;
end $$;

-- ---------- تقدير التكلفة لمنتج × كمية ----------
create or replace function exhibitions.mfg_estimate(p_product_id uuid, p_qty numeric, p_markup numeric default 0)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant(); v_mat numeric; v_lab numeric; v_oh numeric; v_cost numeric; v_price numeric; v_q numeric := greatest(coalesce(p_qty,1),0);
begin
  select coalesce(sum(b.qty*m.cost_per_unit),0) into v_mat from exhibitions.mfg_bom b join exhibitions.mfg_materials m on m.id=b.material_id where b.product_id=p_product_id and b.tenant_id=v_t;
  select coalesce(sum(r.run_minutes/60.0*r.labor_rate),0), coalesce(sum(r.run_minutes/60.0*coalesce(w.hourly_rate,0)),0)
    into v_lab, v_oh from exhibitions.mfg_routing r left join exhibitions.work_centers w on w.id=r.work_center_id where r.product_id=p_product_id and r.tenant_id=v_t;
  v_mat:=round(v_mat*v_q,2); v_lab:=round(v_lab*v_q,2); v_oh:=round(v_oh*v_q,2);
  v_cost:=v_mat+v_lab+v_oh; v_price:=round(v_cost*(1+coalesce(p_markup,0)/100.0),2);
  return json_build_object('material',v_mat,'labor',v_lab,'overhead',v_oh,'cost',v_cost,'price',v_price);
end $$;

-- ---------- أوامر الشغل ----------
create or replace function exhibitions.mfg_wo_create(p_product_id uuid, p_qty numeric, p_customer text, p_markup numeric default 0, p_note text default null)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant(); v_actor uuid := exhibitions.current_profile_id(); v_p exhibitions.mfg_products; v_est json; v_wo uuid; v_no text;
begin
  select * into v_p from exhibitions.mfg_products where id=p_product_id and tenant_id=v_t;
  if not found then raise exception 'المنتج غير موجود'; end if;
  v_est := exhibitions.mfg_estimate(p_product_id,p_qty,p_markup);
  insert into exhibitions.mfg_work_orders(tenant_id,product_id,product_name,qty,customer_name,markup_pct,
     est_material,est_labor,est_overhead,est_total,price,note,created_by)
    values(v_t,p_product_id,v_p.name,greatest(coalesce(p_qty,1),0.001),p_customer,coalesce(p_markup,0),
     (v_est->>'material')::numeric,(v_est->>'labor')::numeric,(v_est->>'overhead')::numeric,(v_est->>'cost')::numeric,(v_est->>'price')::numeric,p_note,v_actor)
    returning id, wo_no into v_wo, v_no;
  return json_build_object('id',v_wo,'wo_no',v_no);
end $$;

create or replace function exhibitions.mfg_wo_list(p_status text default null)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant();
begin
  return (select coalesce(json_agg(json_build_object('id',o.id,'wo_no',o.wo_no,'product',o.product_name,'qty',o.qty,'customer',o.customer_name,
     'status',o.status,'est_total',o.est_total,'price',o.price,
     'actual_total',(o.actual_material+o.actual_labor+o.actual_overhead),'created_at',o.created_at) order by o.created_at desc),'[]')
    from exhibitions.mfg_work_orders o where o.tenant_id=v_t and (p_status is null or o.status=p_status));
end $$;

create or replace function exhibitions.mfg_wo_detail(p_id uuid)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant(); o exhibitions.mfg_work_orders;
begin
  select * into o from exhibitions.mfg_work_orders where id=p_id and tenant_id=v_t;
  if not found then raise exception 'الأمر غير موجود'; end if;
  return json_build_object(
    'id',o.id,'wo_no',o.wo_no,'product',o.product_name,'product_id',o.product_id,'qty',o.qty,'customer',o.customer_name,'status',o.status,'markup_pct',o.markup_pct,'note',o.note,
    'est',json_build_object('material',o.est_material,'labor',o.est_labor,'overhead',o.est_overhead,'total',o.est_total,'price',o.price),
    'actual',json_build_object('material',o.actual_material,'labor',o.actual_labor,'overhead',o.actual_overhead,'total',(o.actual_material+o.actual_labor+o.actual_overhead)),
    'materials',(select coalesce(json_agg(json_build_object('name',x.name_snapshot,'qty',x.qty,'cost',x.line_cost) order by x.created_at),'[]') from exhibitions.mfg_wo_materials x where x.work_order_id=o.id),
    'labor',(select coalesce(json_agg(json_build_object('operation',l.operation,'minutes',l.minutes,'labor',l.labor_cost,'overhead',l.overhead_cost) order by l.created_at),'[]') from exhibitions.mfg_wo_labor l where l.work_order_id=o.id));
end $$;

create or replace function exhibitions.mfg_wo_set_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant(); o exhibitions.mfg_work_orders;
begin
  select * into o from exhibitions.mfg_work_orders where id=p_id and tenant_id=v_t;
  if not found then raise exception 'الأمر غير موجود'; end if;
  if p_status not in ('released','in_progress','done','cancelled') then raise exception 'حالة غير صحيحة'; end if;
  if o.status in ('invoiced','cancelled') then raise exception 'الأمر مُغلق'; end if;
  if p_status='done' then
    update exhibitions.mfg_work_orders set status='done', done_at=now() where id=p_id;
  else
    update exhibitions.mfg_work_orders set status=p_status where id=p_id;
  end if;
end $$;

-- صرف مادة للأمر: خصم المخزون + قيد تكلفة المواد (5010/1100) + تجميع الفعلي
create or replace function exhibitions.mfg_wo_issue_material(p_id uuid, p_material_id uuid, p_qty numeric)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant(); v_actor uuid := exhibitions.current_profile_id(); o exhibitions.mfg_work_orders; v_m exhibitions.mfg_materials; v_cost numeric;
begin
  select * into o from exhibitions.mfg_work_orders where id=p_id and tenant_id=v_t;
  if not found then raise exception 'الأمر غير موجود'; end if;
  if o.status in ('done','invoiced','cancelled','quote') then raise exception 'أصدر الأمر أولًا'; end if;
  if coalesce(p_qty,0)<=0 then raise exception 'كمية غير صحيحة'; end if;
  select * into v_m from exhibitions.mfg_materials where id=p_material_id and tenant_id=v_t;
  if not found then raise exception 'المادة غير موجودة'; end if;
  v_cost := round(p_qty*coalesce(v_m.cost_per_unit,0),2);
  update exhibitions.mfg_materials set current_qty=current_qty-p_qty where id=p_material_id and tenant_id=v_t;
  insert into exhibitions.mfg_material_moves(tenant_id,material_id,delta,reason,ref_table,ref_id,created_by)
    values(v_t,p_material_id,-p_qty,'issue','mfg_work_orders',p_id,v_actor);
  insert into exhibitions.mfg_wo_materials(tenant_id,work_order_id,material_id,name_snapshot,qty,unit_cost,line_cost,created_by)
    values(v_t,p_id,p_material_id,v_m.name,p_qty,coalesce(v_m.cost_per_unit,0),v_cost,v_actor);
  update exhibitions.mfg_work_orders set actual_material=actual_material+v_cost, status=case when status='released' then 'in_progress' else status end where id=p_id;
  if v_cost>0 then
    perform exhibitions._post(current_date,'صرف مواد لأمر شغل','mfg_work_orders',p_id,
      jsonb_build_array(jsonb_build_object('account','5010','debit',v_cost,'credit',0),jsonb_build_object('account','1100','debit',0,'credit',v_cost)));
  end if;
end $$;

-- تسجيل عمالة: تكلفة عمالة + أوفرهيد (للتسعير/المقارنة، بدون قيد لتفادي ازدواج الأجور)
create or replace function exhibitions.mfg_wo_log_labor(p_id uuid, p_work_center_id uuid, p_operation text, p_minutes numeric, p_labor_rate numeric, p_employee_id uuid default null)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant(); v_actor uuid := exhibitions.current_profile_id(); o exhibitions.mfg_work_orders; v_wcr numeric; v_lc numeric; v_oh numeric;
begin
  select * into o from exhibitions.mfg_work_orders where id=p_id and tenant_id=v_t;
  if not found then raise exception 'الأمر غير موجود'; end if;
  if o.status in ('done','invoiced','cancelled','quote') then raise exception 'أصدر الأمر أولًا'; end if;
  if coalesce(p_minutes,0)<=0 then raise exception 'دقائق غير صحيحة'; end if;
  select coalesce(hourly_rate,0) into v_wcr from exhibitions.work_centers where id=p_work_center_id and tenant_id=v_t;
  v_lc := round(p_minutes/60.0*coalesce(p_labor_rate,0),2);
  v_oh := round(p_minutes/60.0*coalesce(v_wcr,0),2);
  insert into exhibitions.mfg_wo_labor(tenant_id,work_order_id,work_center_id,operation,minutes,labor_rate,labor_cost,overhead_cost,employee_id,created_by)
    values(v_t,p_id,p_work_center_id,p_operation,p_minutes,coalesce(p_labor_rate,0),v_lc,v_oh,p_employee_id,v_actor);
  update exhibitions.mfg_work_orders set actual_labor=actual_labor+v_lc, actual_overhead=actual_overhead+v_oh,
    status=case when status='released' then 'in_progress' else status end where id=p_id;
end $$;

-- فوترة: قيد الإيراد (نقد/شبكة/ذمم → 4060) وإغلاق الأمر
create or replace function exhibitions.mfg_wo_invoice(p_id uuid, p_payment_method text default 'cash')
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._mfg_tenant(); v_actor uuid := exhibitions.current_profile_id(); o exhibitions.mfg_work_orders; v_acc text;
begin
  select * into o from exhibitions.mfg_work_orders where id=p_id and tenant_id=v_t;
  if not found then raise exception 'الأمر غير موجود'; end if;
  if o.status<>'done' then raise exception 'أنجِز الأمر قبل الفوترة'; end if;
  v_acc := case when p_payment_method='card' then '1020' when p_payment_method='credit' then '1300' else '1010' end;
  if o.price>0 then
    perform exhibitions._post(current_date,'فاتورة تصنيع','mfg_work_orders',p_id,
      jsonb_build_array(jsonb_build_object('account',v_acc,'debit',o.price,'credit',0),
                        jsonb_build_object('account','4060','debit',0,'credit',o.price)));
  end if;
  update exhibitions.mfg_work_orders set status='invoiced', payment_method=coalesce(nullif(p_payment_method,''),'cash'), invoiced_at=now() where id=p_id;
  return json_build_object('id',p_id,'price',o.price,'actual_total',(o.actual_material+o.actual_labor+o.actual_overhead));
end $$;

-- ---------- المنح ----------
grant execute on function exhibitions.mfg_material_set(uuid,text,text,numeric,numeric,boolean) to authenticated;
grant execute on function exhibitions.mfg_material_receive(uuid,numeric,numeric,text,text) to authenticated;
grant execute on function exhibitions.mfg_material_adjust(uuid,numeric,text,text) to authenticated;
grant execute on function exhibitions.mfg_materials_list(boolean) to authenticated;
grant execute on function exhibitions.mfg_workcenter_set(uuid,text,numeric,boolean) to authenticated;
grant execute on function exhibitions.mfg_workcenters_list() to authenticated;
grant execute on function exhibitions.mfg_product_set(uuid,text,text,boolean) to authenticated;
grant execute on function exhibitions.mfg_product_delete(uuid) to authenticated;
grant execute on function exhibitions.mfg_products_list() to authenticated;
grant execute on function exhibitions.mfg_bom_get(uuid) to authenticated;
grant execute on function exhibitions.mfg_bom_set(uuid,jsonb) to authenticated;
grant execute on function exhibitions.mfg_routing_get(uuid) to authenticated;
grant execute on function exhibitions.mfg_routing_set(uuid,jsonb) to authenticated;
grant execute on function exhibitions.mfg_estimate(uuid,numeric,numeric) to authenticated;
grant execute on function exhibitions.mfg_wo_create(uuid,numeric,text,numeric,text) to authenticated;
grant execute on function exhibitions.mfg_wo_list(text) to authenticated;
grant execute on function exhibitions.mfg_wo_detail(uuid) to authenticated;
grant execute on function exhibitions.mfg_wo_set_status(uuid,text) to authenticated;
grant execute on function exhibitions.mfg_wo_issue_material(uuid,uuid,numeric) to authenticated;
grant execute on function exhibitions.mfg_wo_log_labor(uuid,uuid,text,numeric,numeric,uuid) to authenticated;
grant execute on function exhibitions.mfg_wo_invoice(uuid,text) to authenticated;

-- ---------- can_manage_manufacturing في الصلاحيات + my_profile ----------
create or replace function exhibitions.set_im_permissions(
  p_profile_id uuid, p_add_stock boolean, p_approve boolean, p_transfers boolean,
  p_wholesale boolean, p_returns boolean, p_manage_employees boolean default false,
  p_manage_store boolean default false, p_manage_restaurant boolean default false,
  p_manage_market boolean default false, p_manage_manufacturing boolean default false)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  if not exists(select 1 from exhibitions.profiles where id=p_profile_id and tenant_id=exhibitions.current_tenant_id()) then raise exception 'المستخدم غير موجود'; end if;
  insert into exhibitions.im_permissions(profile_id,can_add_stock,can_approve_requests,can_issue_transfers,can_issue_wholesale,can_receive_returns,can_manage_employees,can_manage_store,can_manage_restaurant,can_manage_market,can_manage_manufacturing,updated_at)
    values(p_profile_id,p_add_stock,p_approve,p_transfers,p_wholesale,p_returns,p_manage_employees,p_manage_store,p_manage_restaurant,p_manage_market,p_manage_manufacturing,now())
  on conflict (profile_id) do update set can_add_stock=excluded.can_add_stock, can_approve_requests=excluded.can_approve_requests,
    can_issue_transfers=excluded.can_issue_transfers, can_issue_wholesale=excluded.can_issue_wholesale, can_receive_returns=excluded.can_receive_returns,
    can_manage_employees=excluded.can_manage_employees, can_manage_store=excluded.can_manage_store, can_manage_restaurant=excluded.can_manage_restaurant,
    can_manage_market=excluded.can_manage_market, can_manage_manufacturing=excluded.can_manage_manufacturing, updated_at=now();
end $$;
grant execute on function exhibitions.set_im_permissions(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;

create or replace function exhibitions.my_profile()
returns json language sql stable security definer set search_path=exhibitions,public as $$
  select json_build_object(
    'id',pr.id,'full_name',pr.full_name,'role',pr.role,'status',pr.status,'tenant_id',pr.tenant_id,
    'is_platform_admin', exhibitions.is_platform_admin(),
    'tenant', (select row_to_json(t) from (select id,name,brand_name,logo_url,primary_color,status,subscription_status,subscription_expires_at,business_type from exhibitions.tenants where id=pr.tenant_id) t),
    'permissions',(select row_to_json(x) from (
       select can_add_stock,can_approve_requests,can_issue_transfers,can_issue_wholesale,can_receive_returns,
              can_manage_employees,can_manage_store,can_manage_restaurant,can_manage_market,can_manage_manufacturing
         from exhibitions.im_permissions where profile_id=pr.id) x)
  ) from exhibitions.profiles pr where pr.auth_user_id=auth.uid();
$$;
