-- ============================================================
-- الجرد الدوري (Cycle Count) | Migration 050
-- الفجوة #8 من بحث الأنظمة العالمية (NetSuite/DEAR).
-- يلتقط لقطة لمخزون موقع، يُدخل المستخدم الكميات المعدودة، وعند الإغلاق
-- يولّد حركات تسوية (adjustment) تلقائيًا لتطابق المخزون مع المعدود.
-- متّسق مع نموذجنا: التسوية حركة مخزون فقط (دون قيد GL، كحركات adjustment).
-- الصلاحية: المالك أو مدير بصلاحية can_add_stock.
-- ============================================================

create table if not exists exhibitions.stock_counts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references exhibitions.tenants(id) on delete cascade,
  location_type exhibitions.location_type not null,
  location_id   uuid not null,
  status        text not null default 'open' check (status in ('open','closed','cancelled')),
  notes         text,
  created_by    uuid references exhibitions.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  closed_at     timestamptz
);

create table if not exists exhibitions.stock_count_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references exhibitions.tenants(id) on delete cascade,
  count_id    uuid not null references exhibitions.stock_counts(id) on delete cascade,
  product_id  uuid not null references exhibitions.products(id) on delete restrict,
  system_qty  numeric(14,3) not null default 0,  -- لقطة النظام وقت الإنشاء
  counted_qty numeric(14,3),                       -- ما عُدّ فعليًا (null = لم يُعدّ)
  unique (count_id, product_id)
);

do $$
declare t text; tbls text[] := array['stock_counts','stock_count_items'];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_set_tenant on exhibitions.%I', t);
    execute format('create trigger trg_set_tenant before insert on exhibitions.%I for each row execute function exhibitions._set_tenant()', t);
    execute format('create index if not exists idx_%s_tenant on exhibitions.%I(tenant_id)', t, t);
    execute format('alter table exhibitions.%I enable row level security', t);
    execute format('drop policy if exists admin_all on exhibitions.%I', t);
    execute format('create policy admin_all on exhibitions.%I for all to authenticated using (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions.is_admin() and tenant_id=exhibitions.current_tenant_id())', t);
    execute format('drop policy if exists mgr_count on exhibitions.%I', t);
    execute format('create policy mgr_count on exhibitions.%I for all to authenticated using (exhibitions._im_can(''can_add_stock'') and tenant_id=exhibitions.current_tenant_id()) with check (exhibitions._im_can(''can_add_stock'') and tenant_id=exhibitions.current_tenant_id())', t);
    execute format('grant select,insert,update,delete on exhibitions.%I to authenticated', t);
    execute format('grant all on exhibitions.%I to service_role', t);
  end loop;
end $$;
create index if not exists idx_stock_count_items_count on exhibitions.stock_count_items(count_id);

create or replace function exhibitions._count_tenant() returns uuid
language plpgsql stable security definer set search_path=exhibitions,public as $$
begin
  if not (exhibitions.is_admin() or exhibitions._im_can('can_add_stock')) then raise exception 'غير مصرّح'; end if;
  return exhibitions.current_tenant_id();
end $$;
revoke execute on function exhibitions._count_tenant() from public, anon, authenticated;

-- إنشاء جرد لموقع: يلتقط لقطة لكل المنتجات الموجودة في الموقع (counted = system مبدئيًا)
create or replace function exhibitions.stock_count_create(p_location_type text, p_location_id uuid, p_notes text default null)
returns uuid language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._count_tenant(); v_actor uuid := exhibitions.current_profile_id(); v_id uuid;
begin
  insert into exhibitions.stock_counts(tenant_id,location_type,location_id,status,notes,created_by)
    values(v_t,p_location_type::exhibitions.location_type,p_location_id,'open',p_notes,v_actor) returning id into v_id;
  insert into exhibitions.stock_count_items(tenant_id,count_id,product_id,system_qty,counted_qty)
    select v_t, v_id, i.product_id, i.quantity, i.quantity
    from exhibitions.inventory i
    join exhibitions.products p on p.id=i.product_id
    where i.location_type=p_location_type::exhibitions.location_type and i.location_id=p_location_id
      and p.tenant_id=v_t;
  return v_id;
end $$;

-- تعيين الكمية المعدودة لبند (أو إضافة منتج لم يكن مرصودًا)
create or replace function exhibitions.stock_count_set_item(p_count_id uuid, p_product_id uuid, p_counted numeric)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._count_tenant(); v_sys numeric;
begin
  if not exists(select 1 from exhibitions.stock_counts where id=p_count_id and tenant_id=v_t and status='open') then
    raise exception 'الجرد غير موجود أو مغلق'; end if;
  if not exists(select 1 from exhibitions.products where id=p_product_id and tenant_id=v_t) then
    raise exception 'منتج غير صحيح'; end if;
  insert into exhibitions.stock_count_items(tenant_id,count_id,product_id,system_qty,counted_qty)
    values(v_t,p_count_id,p_product_id,
      coalesce((select quantity from exhibitions.inventory i
                join exhibitions.stock_counts c on c.id=p_count_id
                where i.product_id=p_product_id and i.location_type=c.location_type and i.location_id=c.location_id),0),
      p_counted)
    on conflict (count_id,product_id) do update set counted_qty=excluded.counted_qty;
end $$;

-- إغلاق الجرد: توليد حركات تسوية لمطابقة المخزون مع المعدود
create or replace function exhibitions.stock_count_close(p_count_id uuid)
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._count_tenant(); v_actor uuid := exhibitions.current_profile_id();
        c record; it record; v_cur numeric; v_diff numeric; v_adj int := 0;
begin
  select * into c from exhibitions.stock_counts where id=p_count_id and tenant_id=v_t and status='open';
  if c.id is null then raise exception 'الجرد غير موجود أو مغلق'; end if;
  for it in select * from exhibitions.stock_count_items where count_id=p_count_id and tenant_id=v_t and counted_qty is not null loop
    select coalesce(quantity,0) into v_cur from exhibitions.inventory
      where product_id=it.product_id and location_type=c.location_type and location_id=c.location_id;
    v_cur := coalesce(v_cur,0);
    v_diff := it.counted_qty - v_cur;
    if v_diff > 0 then
      perform exhibitions._move_stock(it.product_id, v_diff, null,null, c.location_type, c.location_id, 'adjustment','stock_counts',p_count_id,v_actor);
      v_adj := v_adj + 1;
    elsif v_diff < 0 then
      perform exhibitions._move_stock(it.product_id, -v_diff, c.location_type, c.location_id, null,null, 'adjustment','stock_counts',p_count_id,v_actor);
      v_adj := v_adj + 1;
    end if;
  end loop;
  update exhibitions.stock_counts set status='closed', closed_at=now() where id=p_count_id;
  return json_build_object('count_id', p_count_id, 'adjustments', v_adj);
end $$;

create or replace function exhibitions.stock_count_cancel(p_count_id uuid)
returns void language plpgsql security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._count_tenant();
begin
  update exhibitions.stock_counts set status='cancelled' where id=p_count_id and tenant_id=v_t and status='open';
  if not found then raise exception 'تعذّر الإلغاء'; end if;
end $$;

create or replace function exhibitions.stock_count_list()
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._count_tenant();
begin
  return (select coalesce(json_agg(row_to_json(x) order by x.created_at desc),'[]') from (
    select sc.id, sc.location_type, sc.location_id, sc.status, sc.notes, sc.created_at, sc.closed_at,
      case sc.location_type
        when 'warehouse' then (select name from exhibitions.warehouses w where w.id=sc.location_id)
        when 'branch' then (select name from exhibitions.branches b where b.id=sc.location_id)
        else null end as location_name,
      (select count(*) from exhibitions.stock_count_items i where i.count_id=sc.id) as items_count
    from exhibitions.stock_counts sc where sc.tenant_id=v_t) x);
end $$;

create or replace function exhibitions.stock_count_get(p_count_id uuid)
returns json language plpgsql stable security definer set search_path=exhibitions,public as $$
declare v_t uuid := exhibitions._count_tenant();
begin
  return (select json_build_object(
    'count',(select row_to_json(o) from (
      select sc.id, sc.location_type, sc.location_id, sc.status, sc.notes, sc.created_at, sc.closed_at
      from exhibitions.stock_counts sc where sc.id=p_count_id and sc.tenant_id=v_t) o),
    'items',(select coalesce(json_agg(row_to_json(it) order by it.product_name),'[]') from (
      select i.id, i.product_id, p.name as product_name, p.product_code, p.base_unit,
             i.system_qty, i.counted_qty,
             (coalesce(i.counted_qty, i.system_qty) - i.system_qty) as variance
      from exhibitions.stock_count_items i
      join exhibitions.products p on p.id=i.product_id
      where i.count_id=p_count_id and i.tenant_id=v_t) it)
  ));
end $$;

grant execute on function exhibitions.stock_count_create(text, uuid, text) to authenticated;
grant execute on function exhibitions.stock_count_set_item(uuid, uuid, numeric) to authenticated;
grant execute on function exhibitions.stock_count_close(uuid) to authenticated;
grant execute on function exhibitions.stock_count_cancel(uuid) to authenticated;
grant execute on function exhibitions.stock_count_list() to authenticated;
grant execute on function exhibitions.stock_count_get(uuid) to authenticated;
