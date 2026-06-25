-- ============================================================
-- مخزون مواد المطعم + الوصفات + الخصم التلقائي | Migration 016
-- المواد الخام (مكوّنات) بكمية وحد إعادة طلب وتكلفة؛ التوريد يرفع المخزون
-- مع قيد محاسبي؛ الوصفة تربط كل صنف منيو بمكوّناته؛ عند إقفال الفاتورة
-- تُخصم المكوّنات تلقائيًا وتُحتسب تكلفة المبيعات (COGS). تقرير النواقص
-- = قائمة الشراء.
-- حسابات: 1100 المخزون، 5010 تكلفة المبيعات، 1010/1020 نقد/شبكة.
-- ============================================================

create table if not exists exhibitions.ingredients (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references exhibitions.tenants(id) on delete cascade,
  name          text not null,
  unit          text not null default 'قطعة',
  current_qty   numeric(14,3) not null default 0,
  reorder_level numeric(14,3) not null default 0,
  cost_per_unit numeric(14,4) not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists exhibitions.ingredient_movements (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references exhibitions.tenants(id) on delete cascade,
  ingredient_id uuid not null references exhibitions.ingredients(id) on delete cascade,
  delta         numeric(14,3) not null,
  reason        text not null check (reason in ('purchase','usage','adjustment','waste')),
  ref_table     text,
  ref_id        uuid,
  note          text,
  created_by    uuid references exhibitions.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists exhibitions.recipe_items (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references exhibitions.tenants(id) on delete cascade,
  menu_item_id  uuid not null references exhibitions.menu_items(id) on delete cascade,
  ingredient_id uuid not null references exhibitions.ingredients(id) on delete cascade,
  qty           numeric(14,3) not null check (qty > 0),
  unique (menu_item_id, ingredient_id)
);

-- الختم التلقائي + الفهارس + RLS (أدمن + مدير بصلاحية المطعم)
do $$
declare t text;
  tbls text[] := array['ingredients','ingredient_movements','recipe_items'];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_set_tenant on exhibitions.%I', t);
    execute format('create trigger trg_set_tenant before insert on exhibitions.%I for each row execute function exhibitions._set_tenant()', t);
    execute format('create index if not exists idx_%s_tenant on exhibitions.%I(tenant_id)', t, t);
    execute format('alter table exhibitions.%I enable row level security', t);
    execute format('drop policy if exists admin_all on exhibitions.%I', t);
    execute format('create policy admin_all on exhibitions.%I for all to authenticated using (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id())', t);
    execute format('drop policy if exists mgr_rest on exhibitions.%I', t);
    execute format('create policy mgr_rest on exhibitions.%I for all to authenticated using (exhibitions._im_can(''can_manage_restaurant'') and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions._im_can(''can_manage_restaurant'') and tenant_id=exhibitions.current_tenant_id())', t);
    execute format('grant select,insert,update,delete on exhibitions.%I to authenticated', t);
    execute format('grant all on exhibitions.%I to service_role', t);
  end loop;
end $$;

create index if not exists idx_ing_mov_ing on exhibitions.ingredient_movements(ingredient_id);
create index if not exists idx_recipe_item on exhibitions.recipe_items(menu_item_id);

-- ============================================================
-- إدارة المواد (admin أو مدير بصلاحية can_manage_restaurant)
-- ============================================================
create or replace function exhibitions.ingredient_set(
  p_id uuid, p_name text, p_unit text, p_reorder numeric, p_cost numeric, p_active boolean default true)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_id uuid; v_t uuid := exhibitions.current_tenant_id();
begin
  perform exhibitions._rest_can_manage();
  if p_id is null then
    insert into exhibitions.ingredients(tenant_id,name,unit,reorder_level,cost_per_unit,is_active)
      values(v_t,p_name,coalesce(nullif(p_unit,''),'قطعة'),coalesce(p_reorder,0),coalesce(p_cost,0),coalesce(p_active,true))
      returning id into v_id;
  else
    update exhibitions.ingredients set name=p_name, unit=coalesce(nullif(p_unit,''),'قطعة'),
        reorder_level=coalesce(p_reorder,0), cost_per_unit=coalesce(p_cost,cost_per_unit), is_active=coalesce(p_active,true)
      where id=p_id and tenant_id=v_t returning id into v_id;
    if v_id is null then raise exception 'المادة غير موجودة'; end if;
  end if;
  return v_id;
end $$;

-- توريد (شراء): يرفع المخزون بمتوسط تكلفة مرجّح + قيد محاسبي (مخزون/نقد)
create or replace function exhibitions.ingredient_receive(
  p_ingredient_id uuid, p_qty numeric, p_unit_cost numeric, p_payment_method text default 'cash', p_note text default null)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions.current_tenant_id(); v_actor uuid := exhibitions.current_profile_id();
        v_q numeric; v_c numeric; v_newq numeric; v_newcost numeric; v_amount numeric; v_cash text; v_move uuid; v_pm exhibitions.payment_method;
begin
  perform exhibitions._rest_can_manage();
  if coalesce(p_qty,0) <= 0 then raise exception 'الكمية يجب أن تكون أكبر من صفر'; end if;
  select current_qty, cost_per_unit into v_q, v_c from exhibitions.ingredients where id=p_ingredient_id and tenant_id=v_t;
  if not found then raise exception 'المادة غير موجودة'; end if;
  v_newq := v_q + p_qty;
  v_newcost := case when v_newq > 0 then ((v_q*coalesce(v_c,0)) + (p_qty*coalesce(p_unit_cost,0)))/v_newq else coalesce(p_unit_cost,0) end;
  update exhibitions.ingredients set current_qty=v_newq, cost_per_unit=v_newcost where id=p_ingredient_id and tenant_id=v_t;
  insert into exhibitions.ingredient_movements(tenant_id,ingredient_id,delta,reason,ref_table,note,created_by)
    values(v_t,p_ingredient_id,p_qty,'purchase','ingredients',p_note,v_actor) returning id into v_move;
  v_amount := p_qty*coalesce(p_unit_cost,0);
  if v_amount > 0 then
    v_pm := coalesce(nullif(p_payment_method,''),'cash')::exhibitions.payment_method;
    v_cash := case when v_pm='card' then '1020' else '1010' end;
    perform exhibitions._post(current_date,'شراء مواد مطعم','ingredient_movements',v_move,
      jsonb_build_array(
        jsonb_build_object('account','1100','debit',v_amount,'credit',0),
        jsonb_build_object('account',v_cash,'debit',0,'credit',v_amount)));
  end if;
  return json_build_object('ingredient_id',p_ingredient_id,'new_qty',v_newq,'amount',v_amount);
end $$;

-- جرد/هدر: ضبط الكمية الفعلية + قيد فرق (هدر = تكلفة مبيعات)
create or replace function exhibitions.ingredient_adjust(
  p_ingredient_id uuid, p_new_qty numeric, p_reason text default 'adjustment', p_note text default null)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions.current_tenant_id(); v_actor uuid := exhibitions.current_profile_id();
        v_q numeric; v_c numeric; v_delta numeric; v_val numeric; v_reason text;
begin
  perform exhibitions._rest_can_manage();
  v_reason := case when p_reason='waste' then 'waste' else 'adjustment' end;
  select current_qty, cost_per_unit into v_q, v_c from exhibitions.ingredients where id=p_ingredient_id and tenant_id=v_t;
  if not found then raise exception 'المادة غير موجودة'; end if;
  v_delta := coalesce(p_new_qty,0) - v_q;
  if v_delta = 0 then return; end if;
  update exhibitions.ingredients set current_qty=coalesce(p_new_qty,0) where id=p_ingredient_id and tenant_id=v_t;
  insert into exhibitions.ingredient_movements(tenant_id,ingredient_id,delta,reason,ref_table,note,created_by)
    values(v_t,p_ingredient_id,v_delta,v_reason,'ingredients',p_note,v_actor);
  v_val := abs(v_delta)*coalesce(v_c,0);
  if v_val > 0 then
    if v_delta < 0 then
      perform exhibitions._post(current_date,'هدر/نقص جرد مواد','ingredients',p_ingredient_id,
        jsonb_build_array(jsonb_build_object('account','5010','debit',v_val,'credit',0),
                          jsonb_build_object('account','1100','debit',0,'credit',v_val)));
    else
      perform exhibitions._post(current_date,'زيادة جرد مواد','ingredients',p_ingredient_id,
        jsonb_build_array(jsonb_build_object('account','1100','debit',v_val,'credit',0),
                          jsonb_build_object('account','5010','debit',0,'credit',v_val)));
    end if;
  end if;
end $$;

-- قائمة المواد مع علم النقص (للأدمن/المدير)
create or replace function exhibitions.ingredients_list(p_low_only boolean default false)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions.current_tenant_id();
begin
  perform exhibitions._rest_can_manage();
  return (select coalesce(json_agg(row_to_json(x) order by (x.current_qty <= x.reorder_level) desc, x.name),'[]') from (
    select i.id,i.name,i.unit,i.current_qty,i.reorder_level,i.cost_per_unit,i.is_active,
           (i.current_qty <= i.reorder_level) as is_low
    from exhibitions.ingredients i
    where i.tenant_id=v_t and (not p_low_only or i.current_qty <= i.reorder_level)
  ) x);
end $$;

-- الوصفة: قراءة/ضبط لكل صنف
create or replace function exhibitions.recipe_get(p_menu_item_id uuid)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions.current_tenant_id();
begin
  perform exhibitions._rest_can_manage();
  return (select coalesce(json_agg(json_build_object(
      'id',r.id,'ingredient_id',r.ingredient_id,'name',i.name,'unit',i.unit,'qty',r.qty) order by i.name),'[]')
    from exhibitions.recipe_items r join exhibitions.ingredients i on i.id=r.ingredient_id
    where r.menu_item_id=p_menu_item_id and r.tenant_id=v_t);
end $$;

create or replace function exhibitions.recipe_set(p_menu_item_id uuid, p_items jsonb)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions.current_tenant_id(); r jsonb;
begin
  perform exhibitions._rest_can_manage();
  if not exists(select 1 from exhibitions.menu_items where id=p_menu_item_id and tenant_id=v_t) then raise exception 'الصنف غير موجود'; end if;
  delete from exhibitions.recipe_items where menu_item_id=p_menu_item_id and tenant_id=v_t;
  for r in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    if coalesce((r->>'qty')::numeric,0) > 0 then
      insert into exhibitions.recipe_items(tenant_id,menu_item_id,ingredient_id,qty)
        values(v_t,p_menu_item_id,(r->>'ingredient_id')::uuid,(r->>'qty')::numeric)
      on conflict (menu_item_id,ingredient_id) do update set qty=excluded.qty;
    end if;
  end loop;
end $$;

-- ============================================================
-- تعديل إقفال الفاتورة: خصم المكوّنات حسب الوصفة + قيد تكلفة المبيعات
-- ============================================================
create or replace function exhibitions.close_table_bill(p_session_id uuid, p_payment_method text default 'cash', p_token uuid default null)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_actor uuid; v_tenant uuid; v_table uuid; v_total numeric; v_cash text; v_pm exhibitions.payment_method;
        v_cogs numeric := 0; rec record; v_lines jsonb;
begin
  select * into v_actor, v_tenant from exhibitions._rest_ctx(p_token);
  select table_id into v_table from exhibitions.table_sessions
    where id=p_session_id and tenant_id=v_tenant and status in ('open','billing');
  if not found then raise exception 'الجلسة غير موجودة أو مقفلة مسبقًا'; end if;
  v_pm := coalesce(nullif(p_payment_method,''),'cash')::exhibitions.payment_method;
  select coalesce(sum(oi.line_total_sar),0) into v_total
    from exhibitions.order_items oi join exhibitions.orders o on o.id=oi.order_id
    where o.session_id=p_session_id and o.tenant_id=v_tenant and o.status<>'cancelled';

  -- خصم المكوّنات حسب الوصفات + احتساب التكلفة
  for rec in
    select ri.ingredient_id as ing, sum(oi.qty*ri.qty) as used, max(g.cost_per_unit) as cost
    from exhibitions.order_items oi
    join exhibitions.orders o on o.id=oi.order_id
    join exhibitions.recipe_items ri on ri.menu_item_id=oi.menu_item_id and ri.tenant_id=v_tenant
    join exhibitions.ingredients g on g.id=ri.ingredient_id
    where o.session_id=p_session_id and o.tenant_id=v_tenant and o.status<>'cancelled'
    group by ri.ingredient_id
  loop
    update exhibitions.ingredients set current_qty = current_qty - rec.used where id=rec.ing and tenant_id=v_tenant;
    insert into exhibitions.ingredient_movements(tenant_id,ingredient_id,delta,reason,ref_table,ref_id,created_by)
      values(v_tenant,rec.ing,-rec.used,'usage','table_sessions',p_session_id,v_actor);
    v_cogs := v_cogs + rec.used*coalesce(rec.cost,0);
  end loop;

  v_cash := case when v_pm='card' then '1020' else '1010' end;
  v_lines := jsonb_build_array(
    jsonb_build_object('account',v_cash,'debit',v_total,'credit',0),
    jsonb_build_object('account','4040','debit',0,'credit',v_total));
  if v_cogs > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account','5010','debit',v_cogs,'credit',0),
      jsonb_build_object('account','1100','debit',0,'credit',v_cogs));
  end if;
  if v_total > 0 or v_cogs > 0 then
    perform exhibitions._post(current_date,'فاتورة مطعم','table_sessions',p_session_id,v_lines);
  end if;

  update exhibitions.table_sessions
    set status='paid', total_sar=v_total, payment_method=v_pm, closed_by=v_actor, closed_at=now()
    where id=p_session_id;
  update exhibitions.orders set status='served'
    where session_id=p_session_id and tenant_id=v_tenant and status in ('new','preparing','ready');
  update exhibitions.dining_tables set status='free' where id=v_table and tenant_id=v_tenant;
  return json_build_object('session_id',p_session_id,'total',v_total,'cogs',v_cogs,'payment_method',v_pm);
end $$;

grant execute on function exhibitions.ingredient_set(uuid,text,text,numeric,numeric,boolean) to authenticated;
grant execute on function exhibitions.ingredient_receive(uuid,numeric,numeric,text,text) to authenticated;
grant execute on function exhibitions.ingredient_adjust(uuid,numeric,text,text) to authenticated;
grant execute on function exhibitions.ingredients_list(boolean) to authenticated;
grant execute on function exhibitions.recipe_get(uuid) to authenticated;
grant execute on function exhibitions.recipe_set(uuid,jsonb) to authenticated;
grant execute on function exhibitions.close_table_bill(uuid,text,uuid) to anon, authenticated;
