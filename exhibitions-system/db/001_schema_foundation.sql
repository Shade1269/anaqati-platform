-- ============================================================
-- نظام إدارة المعارض والمخزون — العمود الفقري (Migration 001)
-- Supabase project: atlantis (axzqbqzdvtlbgbwzeiry)
-- Schema: exhibitions  (معزولة تمامًا عن schema public)
-- مطبّقة بتاريخ: 2026-06-19  (migration: exhibitions_schema_foundation)
-- ============================================================

create schema if not exists exhibitions;

-- ---------- ENUMS ----------
create type exhibitions.user_role         as enum ('admin','inventory_manager','employee');
create type exhibitions.user_status       as enum ('active','inactive');
create type exhibitions.location_type     as enum ('warehouse','branch','employee_consignment');
create type exhibitions.branch_status     as enum ('planning','active','closed');
create type exhibitions.movement_type     as enum ('receipt','transfer_issue','transfer_return','consignment_out','consignment_return','sale','customer_return','wholesale','adjustment');
create type exhibitions.request_status    as enum ('pending','approved','partial','rejected','fulfilled');
create type exhibitions.transfer_type     as enum ('issue','return');
create type exhibitions.transfer_status   as enum ('pending','completed','cancelled');
create type exhibitions.payment_method    as enum ('cash','card');
create type exhibitions.sale_status       as enum ('completed','returned');
create type exhibitions.settlement_status as enum ('pending','accepted','rejected');
create type exhibitions.expense_scope     as enum ('general','branch');
create type exhibitions.attendance_status as enum ('present','absent');
create type exhibitions.commission_status as enum ('pending','approved','paid','cancelled');
create type exhibitions.commission_mode   as enum ('single_manager','proportional','manual_pool');
create type exhibitions.payroll_status    as enum ('draft','finalized','paid');

-- ============================================================
-- Identity & Access
-- ============================================================
create table exhibitions.profiles (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null, -- للأدمن/مدير المخزون فقط
  full_name    text not null,
  phone        text unique,
  role         exhibitions.user_role   not null default 'employee',
  status       exhibitions.user_status not null default 'active',
  created_at   timestamptz not null default now()
);

create table exhibitions.employee_details (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null unique references exhibitions.profiles(id) on delete cascade,
  access_code        text unique,                       -- كود دخول الموظف (جوال + كود)
  monthly_salary_sar numeric(14,2) not null default 0,
  hire_date          date,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

create table exhibitions.im_permissions (
  id                   uuid primary key default gen_random_uuid(),
  profile_id           uuid not null unique references exhibitions.profiles(id) on delete cascade,
  can_add_stock        boolean not null default false,
  can_approve_requests boolean not null default false,
  can_issue_transfers  boolean not null default false,
  can_issue_wholesale  boolean not null default false,
  can_receive_returns  boolean not null default false,
  updated_at           timestamptz not null default now()
);

-- ============================================================
-- Catalog
-- ============================================================
create table exhibitions.suppliers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text,
  notes      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table exhibitions.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  parent_id  uuid references exhibitions.categories(id) on delete set null,
  created_at timestamptz not null default now()
);

create table exhibitions.products (
  id             uuid primary key default gen_random_uuid(),
  product_code   text not null unique,
  name           text not null,
  category_id    uuid references exhibitions.categories(id) on delete set null,
  sale_price_ref numeric(14,2) not null default 0,        -- سعر بيع مرجعي
  cost_price_sar numeric(14,2) not null default 0,        -- 🔒 التكلفة (مخفية - أدمن فقط)
  supplier_id    uuid references exhibitions.suppliers(id) on delete set null,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

-- ============================================================
-- Locations
-- ============================================================
create table exhibitions.warehouses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  location   text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table exhibitions.branches (        -- المعارض = مراكز ربح
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  location              text,
  start_date            date,
  end_date              date,
  status                exhibitions.branch_status not null default 'planning',
  target_amount_sar     numeric(14,2) not null default 0,
  commission_percentage numeric(6,3) not null default 0,
  commission_mode       exhibitions.commission_mode,        -- ⚠️ القرار المفتوح (بند 10)
  manager_id            uuid references exhibitions.profiles(id) on delete set null,
  source_warehouse_id   uuid references exhibitions.warehouses(id) on delete set null,
  created_by            uuid references exhibitions.profiles(id) on delete set null,
  created_at            timestamptz not null default now()
);

-- ============================================================
-- Inventory
-- ============================================================
create table exhibitions.inventory (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references exhibitions.products(id) on delete restrict,
  location_type exhibitions.location_type not null,
  location_id   uuid not null,
  quantity      integer not null default 0,
  updated_at    timestamptz not null default now(),
  unique (product_id, location_type, location_id)
);

create table exhibitions.stock_movements (   -- immutable ledger
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references exhibitions.products(id) on delete restrict,
  movement_type      exhibitions.movement_type not null,
  qty                integer not null,
  from_location_type exhibitions.location_type,
  from_location_id   uuid,
  to_location_type   exhibitions.location_type,
  to_location_id     uuid,
  ref_table          text,
  ref_id             uuid,
  created_by         uuid references exhibitions.profiles(id) on delete set null,
  created_at         timestamptz not null default now()
);

-- ============================================================
-- Procurement
-- ============================================================
create table exhibitions.stock_receipts (
  id           uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references exhibitions.warehouses(id) on delete restrict,
  supplier_id  uuid references exhibitions.suppliers(id) on delete set null,
  received_by  uuid references exhibitions.profiles(id) on delete set null,
  notes        text,
  created_at   timestamptz not null default now()
);
create table exhibitions.stock_receipt_items (
  id         uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references exhibitions.stock_receipts(id) on delete cascade,
  product_id uuid not null references exhibitions.products(id) on delete restrict,
  qty        integer not null check (qty > 0)
);

-- ============================================================
-- Distribution
-- ============================================================
create table exhibitions.stock_requests (
  id           uuid primary key default gen_random_uuid(),
  branch_id    uuid not null references exhibitions.branches(id) on delete cascade,
  requested_by uuid references exhibitions.profiles(id) on delete set null,
  status       exhibitions.request_status not null default 'pending',
  reviewed_by  uuid references exhibitions.profiles(id) on delete set null,
  reviewed_at  timestamptz,
  notes        text,
  created_at   timestamptz not null default now()
);
create table exhibitions.stock_request_items (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references exhibitions.stock_requests(id) on delete cascade,
  product_id    uuid not null references exhibitions.products(id) on delete restrict,
  qty_requested integer not null check (qty_requested > 0),
  qty_approved  integer
);

create table exhibitions.stock_transfers (
  id                 uuid primary key default gen_random_uuid(),
  type               exhibitions.transfer_type not null,
  from_location_type exhibitions.location_type not null,
  from_location_id   uuid not null,
  to_location_type   exhibitions.location_type not null,
  to_location_id     uuid not null,
  request_id         uuid references exhibitions.stock_requests(id) on delete set null,
  issued_by          uuid references exhibitions.profiles(id) on delete set null,
  status             exhibitions.transfer_status not null default 'completed',
  created_at         timestamptz not null default now()
);
create table exhibitions.stock_transfer_items (
  id          uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references exhibitions.stock_transfers(id) on delete cascade,
  product_id  uuid not null references exhibitions.products(id) on delete restrict,
  qty         integer not null check (qty > 0)
);

-- ============================================================
-- Sales
-- ============================================================
create table exhibitions.sales (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references exhibitions.branches(id) on delete restrict,
  employee_id    uuid references exhibitions.profiles(id) on delete set null,
  payment_method exhibitions.payment_method not null,
  total_sar      numeric(14,2) not null default 0,
  status         exhibitions.sale_status not null default 'completed',
  created_at     timestamptz not null default now()
);
create table exhibitions.sale_items (
  id                     uuid primary key default gen_random_uuid(),
  sale_id                uuid not null references exhibitions.sales(id) on delete cascade,
  product_id             uuid not null references exhibitions.products(id) on delete restrict,
  qty                    integer not null check (qty > 0),
  unit_sale_price_sar    numeric(14,2) not null,            -- الموظف يحدده
  unit_cost_snapshot_sar numeric(14,2) not null default 0   -- 🔒 لقطة التكلفة وقت البيع
);

create table exhibitions.sale_returns (
  id                uuid primary key default gen_random_uuid(),
  sale_id           uuid not null references exhibitions.sales(id) on delete restrict,
  branch_id         uuid not null references exhibitions.branches(id) on delete restrict,
  employee_id       uuid references exhibitions.profiles(id) on delete set null,
  refund_amount_sar numeric(14,2) not null default 0,
  refund_method     exhibitions.payment_method,
  created_at        timestamptz not null default now()
);
create table exhibitions.sale_return_items (
  id           uuid primary key default gen_random_uuid(),
  return_id    uuid not null references exhibitions.sale_returns(id) on delete cascade,
  sale_item_id uuid not null references exhibitions.sale_items(id) on delete restrict,
  qty          integer not null check (qty > 0)
);

-- ============================================================
-- Consignment
-- ============================================================
create table exhibitions.consignment_withdrawals (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references exhibitions.profiles(id) on delete restrict,
  branch_id   uuid not null references exhibitions.branches(id) on delete restrict,
  product_id  uuid not null references exhibitions.products(id) on delete restrict,
  qty         integer not null check (qty > 0),
  created_at  timestamptz not null default now()
);

create table exhibitions.consignment_settlements (
  id                         uuid primary key default gen_random_uuid(),
  employee_id                uuid not null references exhibitions.profiles(id) on delete restrict,
  period_from                date,
  period_to                  date,
  declared_cash_sar          numeric(14,2) not null default 0,
  declared_card_sar          numeric(14,2) not null default 0,
  total_declared_sar         numeric(14,2) generated always as (declared_cash_sar + declared_card_sar) stored,
  status                     exhibitions.settlement_status not null default 'pending',
  admin_confirmed_amount_sar numeric(14,2),
  shortage_sar               numeric(14,2),
  shortage_reason            text,
  confirmed_by               uuid references exhibitions.profiles(id) on delete set null,
  confirmed_at               timestamptz,
  created_at                 timestamptz not null default now()
);

-- ============================================================
-- Finance
-- ============================================================
create table exhibitions.expenses (
  id           uuid primary key default gen_random_uuid(),
  scope        exhibitions.expense_scope not null default 'general',
  branch_id    uuid references exhibitions.branches(id) on delete set null,
  category     text,
  amount_sar   numeric(14,2) not null,
  description  text,
  expense_date date not null default current_date,
  created_by   uuid references exhibitions.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table exhibitions.wholesale_orders (
  id             uuid primary key default gen_random_uuid(),
  customer_name  text,
  customer_phone text,
  warehouse_id   uuid not null references exhibitions.warehouses(id) on delete restrict,
  payment_method exhibitions.payment_method not null,
  total_sar      numeric(14,2) not null default 0,
  issued_by      uuid references exhibitions.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create table exhibitions.wholesale_order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references exhibitions.wholesale_orders(id) on delete cascade,
  product_id     uuid not null references exhibitions.products(id) on delete restrict,
  qty            integer not null check (qty > 0),
  unit_price_sar numeric(14,2) not null
);

-- ============================================================
-- HR / Payroll
-- ============================================================
create table exhibitions.attendance (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references exhibitions.profiles(id) on delete cascade,
  work_date   date not null,
  status      exhibitions.attendance_status not null default 'present',
  branch_id   uuid references exhibitions.branches(id) on delete set null,
  recorded_by uuid references exhibitions.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (employee_id, work_date)
);

create table exhibitions.salary_advances (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references exhibitions.profiles(id) on delete cascade,
  amount_sar  numeric(14,2) not null,
  branch_id   uuid references exhibitions.branches(id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now()
);

create table exhibitions.payroll (
  id                    uuid primary key default gen_random_uuid(),
  employee_id           uuid not null references exhibitions.profiles(id) on delete cascade,
  period_month          text not null,                 -- 'YYYY-MM'
  monthly_salary_sar    numeric(14,2) not null default 0,
  daily_rate_sar        numeric(14,2) not null default 0,
  present_days          integer not null default 0,
  gross_sar             numeric(14,2) not null default 0,
  advances_deducted_sar numeric(14,2) not null default 0,
  commission_sar        numeric(14,2) not null default 0,
  net_sar               numeric(14,2) not null default 0,
  status                exhibitions.payroll_status not null default 'draft',
  created_at            timestamptz not null default now(),
  unique (employee_id, period_month)
);

create table exhibitions.commissions (
  id                  uuid primary key default gen_random_uuid(),
  branch_id           uuid not null references exhibitions.branches(id) on delete cascade,
  beneficiary_id      uuid references exhibitions.profiles(id) on delete set null, -- ⚠️ القرار المفتوح (بند 10)
  target_amount_sar   numeric(14,2) not null default 0,
  achieved_amount_sar numeric(14,2) not null default 0,
  commission_pct      numeric(6,3) not null default 0,
  commission_sar      numeric(14,2) not null default 0,
  status              exhibitions.commission_status not null default 'pending',
  created_at          timestamptz not null default now()
);

-- ============================================================
-- System
-- ============================================================
create table exhibitions.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references exhibitions.profiles(id) on delete cascade,
  type         text,
  title        text,
  body         text,
  ref_table    text,
  ref_id       uuid,
  is_read      boolean not null default false,
  created_at   timestamptz not null default now()
);

create table exhibitions.audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references exhibitions.profiles(id) on delete set null,
  action     text not null,
  entity     text,
  entity_id  uuid,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Indexes
-- ============================================================
create index idx_exh_inventory_loc      on exhibitions.inventory (location_type, location_id);
create index idx_exh_inventory_product  on exhibitions.inventory (product_id);
create index idx_exh_movements_product  on exhibitions.stock_movements (product_id);
create index idx_exh_movements_created  on exhibitions.stock_movements (created_at);
create index idx_exh_products_category  on exhibitions.products (category_id);
create index idx_exh_products_supplier  on exhibitions.products (supplier_id);
create index idx_exh_sales_branch       on exhibitions.sales (branch_id);
create index idx_exh_sales_employee     on exhibitions.sales (employee_id);
create index idx_exh_sales_created      on exhibitions.sales (created_at);
create index idx_exh_sale_items_sale    on exhibitions.sale_items (sale_id);
create index idx_exh_sale_items_product on exhibitions.sale_items (product_id);
create index idx_exh_requests_branch    on exhibitions.stock_requests (branch_id);
create index idx_exh_requests_status    on exhibitions.stock_requests (status);
create index idx_exh_withdrawals_emp    on exhibitions.consignment_withdrawals (employee_id);
create index idx_exh_settlements_emp    on exhibitions.consignment_settlements (employee_id);
create index idx_exh_attendance_emp     on exhibitions.attendance (employee_id, work_date);
create index idx_exh_notifications_rcpt on exhibitions.notifications (recipient_id, is_read);

-- ============================================================
-- Helper functions (role resolution) — SECURITY DEFINER
-- ============================================================
create or replace function exhibitions.current_profile_id()
returns uuid language sql stable security definer set search_path = exhibitions, public as $$
  select id from exhibitions.profiles where auth_user_id = auth.uid() limit 1;
$$;

create or replace function exhibitions.current_user_role()
returns exhibitions.user_role language sql stable security definer set search_path = exhibitions, public as $$
  select role from exhibitions.profiles where auth_user_id = auth.uid() limit 1;
$$;

create or replace function exhibitions.is_admin()
returns boolean language sql stable security definer set search_path = exhibitions, public as $$
  select exists (
    select 1 from exhibitions.profiles
    where auth_user_id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

-- ============================================================
-- RLS: تفعيل على كل الجداول + سياسة "الأدمن يقدر على كل شي".
-- مدير المخزون والموظف يوصلوا عبر RPCs (SECURITY DEFINER) لاحقًا.
-- service_role يتجاوز RLS تلقائيًا (للباك-إند).
-- ============================================================
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'exhibitions'
  loop
    execute format('alter table exhibitions.%I enable row level security', t);
    execute format(
      'create policy admin_all on exhibitions.%I for all to authenticated using (exhibitions.is_admin()) with check (exhibitions.is_admin())', t);
  end loop;
end $$;

-- ============================================================
-- Grants
-- ============================================================
grant usage on schema exhibitions to anon, authenticated, service_role;
grant all on all tables in schema exhibitions to service_role;
grant select, insert, update, delete on all tables in schema exhibitions to authenticated;
grant execute on all functions in schema exhibitions to anon, authenticated, service_role;
