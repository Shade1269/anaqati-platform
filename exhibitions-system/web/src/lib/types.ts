export type Role = 'admin' | 'inventory_manager';

export interface Permissions {
  can_add_stock?: boolean;
  can_approve_requests?: boolean;
  can_issue_transfers?: boolean;
  can_transfers?: boolean;
  can_issue_wholesale?: boolean;
  can_receive_returns?: boolean;
  can_returns?: boolean;
  can_manage_employees?: boolean;
  can_manage_store?: boolean;
  can_manage_restaurant?: boolean;
  can_manage_market?: boolean;
  can_manage_manufacturing?: boolean;
  [key: string]: boolean | undefined;
}

export interface ManagerEmployeeRow {
  id: string;
  full_name: string;
  phone: string | null;
  status: string | null;
  access_code: string | null;
  hire_date: string | null;
  is_active: boolean | null;
}

export interface TenantBranding {
  id: string;
  name: string;
  brand_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  status: string | null;
  subscription_status: string | null;
  subscription_expires_at: string | null;
  business_type?: 'retail' | 'restaurant' | 'manufacturing' | 'distribution';
  business_subtype?: 'general' | 'plastics' | 'wood' | 'metal';
  currency?: string;
  secondary_currency?: string | null;
  fx_rate?: number | null;
}

export interface MyProfile {
  id: string;
  full_name: string;
  role: Role;
  status: string;
  permissions: Permissions | null;
  tenant_id: string | null;
  is_platform_admin: boolean;
  tenant: TenantBranding | null;
}

/* ----------------------------- Online Store ----------------------------- */

export interface StoreInfo {
  tenant_id: string;
  name: string;
  brand_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  description: string | null;
  whatsapp: string | null;
  delivery_fee: number | null;
  cod_enabled: boolean | null;
  slug: string;
  currency?: string;
  secondary_currency?: string | null;
  fx_rate?: number | null;
}

export interface StoreProduct {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  image_url: string | null;
  price: number;
  in_stock: number;
}

export interface StoreOrderItemInput {
  product_id: string;
  qty: number;
}

export interface StoreCreateOrderPayload {
  slug: string;
  customer_name: string;
  customer_phone: string;
  address: string;
  payment_method: 'cash' | 'card';
  items: StoreOrderItemInput[];
}

export interface StoreCreateOrderResult {
  order_id: string;
  order_no: string;
  total: number;
}

export interface StoreSettings {
  id: string;
  slug: string | null;
  store_enabled: boolean | null;
  store_description: string | null;
  store_whatsapp: string | null;
  delivery_fee: number | null;
  cod_enabled: boolean | null;
}

export interface SellableProduct {
  id: string;
  product_code: string;
  name: string;
  sale_price_ref: number | null;
  online_enabled: boolean | null;
  online_price: number | null;
  image_url: string | null;
  description: string | null;
  is_active: boolean;
}

export interface ProductPatch {
  online_enabled?: boolean;
  online_price?: number | null;
  image_url?: string | null;
  description?: string | null;
}

export type OnlineOrderStatus =
  | 'new'
  | 'confirmed'
  | 'fulfilled'
  | 'cancelled';

export interface OnlineOrder {
  id: string;
  order_no: string;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  payment_method: string | null;
  total_sar: number | null;
  delivery_fee_sar: number | null;
  status: OnlineOrderStatus;
  created_at: string;
}

export interface OnlineOrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  qty: number;
  unit_price_sar: number | null;
  products?: { name: string | null; product_code: string | null } | null;
}

export interface FulfillResult {
  order_id: string;
  revenue: number;
  cogs: number;
}

/* ----------------------------- Platform (white-label SaaS) ----------------------------- */

export interface PlatformTenant {
  id: string;
  name: string;
  brand_name: string | null;
  primary_color: string | null;
  status: string | null;
  subscription_status: string | null;
  subscription_expires_at: string | null;
  created_at: string | null;
  business_type?: 'retail' | 'restaurant' | 'manufacturing' | 'distribution';
  business_subtype?: 'general' | 'plastics' | 'wood' | 'metal';
  employees: number;
  branches: number;
  sales_total: number;
  admin_email: string | null;
}

export interface CreateTenantResult {
  tenant_id: string;
  admin_email: string;
  profile_id: string;
}

export interface EmployeePermissions {
  can_sell: boolean;
  can_return: boolean;
  can_request_stock: boolean;
  can_withdraw: boolean;
  can_settle: boolean;
  can_waiter: boolean;
  can_kitchen: boolean;
}

export interface EmployeeSession {
  token: string;
  profile_id: string;
  full_name: string;
  business_type?: 'retail' | 'restaurant' | 'manufacturing' | 'distribution';
  currency?: string;
  secondary_currency?: string | null;
  fx_rate?: number | null;
  permissions?: EmployeePermissions | null;
}

/* ----------------------------- Restaurant / Café ----------------------------- */

export interface MenuOption {
  id: string;
  group: string;
  name: string;
  price_delta: number;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  description: string | null;
  image_url: string | null;
  is_available: boolean;
  sort: number;
  options: MenuOption[];
}

export interface MenuCategory {
  id: string;
  name: string;
  sort: number;
  is_active: boolean;
  items: MenuItem[];
}

export interface TableSessionBrief {
  id: string;
  session_no: string;
  total: number;
  guest_count: number;
  opened_at: string;
}

export interface DiningTable {
  id: string;
  label: string;
  section: string | null;
  seats: number;
  status: 'free' | 'open' | 'billing';
  is_active: boolean;
  sessions: TableSessionBrief[];
}

export interface OrderItemRow {
  id: string;
  name: string;
  qty: number;
  unit_price: number;
  options: { name: string; price_delta: number }[];
  line_total: number;
  note: string | null;
  voided?: boolean;
  void_reason?: string | null;
}

export interface OrderRow {
  id: string;
  order_no: string;
  status: 'new' | 'preparing' | 'ready' | 'served' | 'cancelled';
  note: string | null;
  created_at: string;
  items: OrderItemRow[];
}

export interface RestaurantPublicInfo {
  brand_name: string;
  logo_url: string | null;
  primary_color: string | null;
  currency: string;
  secondary_currency: string | null;
  fx_rate: number | null;
  delivery_fee: number;
  whatsapp: string | null;
}

export interface QrInfo {
  brand_name: string;
  logo_url: string | null;
  primary_color: string | null;
  currency: string;
  secondary_currency: string | null;
  fx_rate: number | null;
  table_label: string;
}

export type OrderType = 'dine_in' | 'takeaway' | 'delivery';

export interface SessionDetail {
  session: {
    id: string;
    session_no: string;
    status: string;
    guest_count: number;
    total_sar: number;
    opened_at: string;
    order_type: OrderType;
    customer_name: string | null;
    customer_phone: string | null;
    address: string | null;
    delivery_fee: number;
    table_label: string | null;
    section: string | null;
  } | null;
  orders: OrderRow[];
}

export interface RestaurantSettings {
  service_pct: number;
  tax_pct: number;
  loyalty_enabled?: boolean;
  loyalty_earn_rate?: number;
  loyalty_redeem_value?: number;
}

export interface LoyaltyCustomer {
  id: string;
  name: string;
  points: number;
  redeem_value: number;
  enabled: boolean;
}

export interface DistributionDashboard {
  customers_count: number;
  total_receivable: number;
  wholesale_month_total: number;
  wholesale_month_count: number;
  market_orders_month: number;
  top_debtors: { name: string; phone: string | null; balance: number }[];
  recent_wholesale: { customer_name: string | null; total: number; created_at: string }[];
}

export interface RetailReport {
  summary: { bills: number; sales: number; avg_ticket: number; cash: number; card: number };
  cogs: number;
  by_day: { d: string; sales: number; bills: number }[];
  top_items: { name: string; qty: number; revenue: number }[];
  by_branch: { name: string; bills: number; sales: number }[];
  by_hour: { hour: number; bills: number; sales: number }[];
  staff: { name: string; bills: number; sales: number }[];
}

export interface RestaurantReport {
  summary: {
    bills: number;
    sales: number;
    avg_ticket: number;
    dine_in: number;
    takeaway: number;
    delivery: number;
    cash: number;
    card: number;
    discounts: number;
    service: number;
    tax: number;
    tips: number;
  };
  cogs: number;
  by_day: { d: string; sales: number; bills: number }[];
  top_items: { name: string; qty: number; revenue: number }[];
  by_category: { name: string; qty: number; revenue: number }[];
  by_hour: { hour: number; bills: number; sales: number }[];
  staff: { name: string; bills: number; sales: number }[];
}

export interface ShiftZ {
  id: string;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at: string | null;
  opening_float: number;
  opened_by: string | null;
  closed_by: string | null;
  bills: number;
  sales: number;
  cash_sales: number;
  card_sales: number;
  dine_in: number;
  takeaway: number;
  delivery: number;
  delivery_fees: number;
  expected_cash: number;
  declared_cash: number | null;
  variance: number | null;
  note: string | null;
}

export interface QuickSession {
  id: string;
  session_no: string;
  order_type: OrderType;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  delivery_fee: number;
  total: number;
  opened_at: string;
}

export interface KdsOrder {
  id: string;
  order_no: string;
  status: 'new' | 'preparing' | 'ready';
  created_at: string;
  note: string | null;
  table_label: string;
  items: { name: string; qty: number; options: { name: string }[]; note: string | null }[];
}

export interface NewOrderItem {
  menu_item_id: string;
  qty: number;
  options: { name: string; price_delta: number }[];
  note?: string | null;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  current_qty: number;
  reorder_level: number;
  cost_per_unit: number;
  is_active: boolean;
  is_low: boolean;
}

export interface RecipeLine {
  id: string;
  ingredient_id: string;
  name: string;
  unit: string;
  qty: number;
}

/* ----------------------------- Internal Market (B2B) ----------------------------- */

export interface MarketListing {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  unit: string;
  price: number;
  min_order_qty: number;
  image_url: string | null;
  is_active: boolean;
}

export interface MarketBrowseItem {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  unit: string;
  price: number;
  min_order_qty: number;
  image_url: string | null;
  seller_tenant_id: string;
  seller_name: string;
}

export type MarketOrderStatus = 'new' | 'confirmed' | 'fulfilled' | 'cancelled';

export interface MarketOrderRow {
  id: string;
  order_no: string;
  status: MarketOrderStatus;
  payment_method: 'cash' | 'credit';
  total: number;
  note: string | null;
  created_at: string;
  counterparty: string;
}

export interface MarketOrderDetail {
  id: string;
  order_no: string;
  status: MarketOrderStatus;
  payment_method: 'cash' | 'credit';
  total: number;
  note: string | null;
  created_at: string;
  is_seller: boolean;
  items: { name: string; unit: string | null; qty: number; unit_price: number; line_total: number }[];
}

/* ----------------------------- Manufacturing (job-shop) ----------------------------- */

export interface WorkCenter {
  id: string;
  name: string;
  hourly_rate: number;
  is_active: boolean;
}

export interface MfgMaterial {
  id: string;
  name: string;
  unit: string;
  current_qty: number;
  reorder_level: number;
  cost_per_unit: number;
  is_active: boolean;
  is_low: boolean;
  density?: number | null;
}

export interface MfgMold {
  id: string;
  name: string;
  cavities: number;
  product_id: string | null;
  product: string | null;
  note: string | null;
  is_active: boolean;
}

export interface MfgProduct {
  id: string;
  name: string;
  unit: string;
  is_active: boolean;
}

export interface MfgBomLine {
  id: string;
  material_id: string;
  name: string;
  unit: string;
  qty: number;
  cost: number;
}

export interface MfgRoutingOp {
  id: string;
  seq: number;
  operation: string;
  work_center_id: string | null;
  work_center: string | null;
  run_minutes: number;
  labor_rate: number;
  wc_rate: number | null;
}

export interface MfgEstimate {
  material: number;
  labor: number;
  overhead: number;
  cost: number;
  price: number;
}

export interface MfgWorkOrderRow {
  id: string;
  wo_no: string;
  product: string;
  qty: number;
  customer: string | null;
  status: 'quote' | 'released' | 'in_progress' | 'done' | 'invoiced' | 'cancelled';
  est_total: number;
  price: number;
  actual_total: number;
  created_at: string;
}

export interface MfgWorkOrderDetail {
  id: string;
  wo_no: string;
  product: string;
  product_id: string | null;
  qty: number;
  customer: string | null;
  status: MfgWorkOrderRow['status'];
  markup_pct: number;
  note: string | null;
  produced_qty: number;
  scrap_qty: number;
  est: { material: number; labor: number; overhead: number; total: number; price: number };
  actual: { material: number; labor: number; overhead: number; total: number };
  materials: { name: string; qty: number; cost: number }[];
  labor: { operation: string | null; minutes: number; labor: number; overhead: number }[];
}

export interface Branch {
  id: string;
  name: string;
  location: string | null;
  status?: string;
  start_date?: string | null;
  end_date?: string | null;
  target_amount_sar?: number | null;
  commission_percentage?: number | null;
  commission_mode?: string | null;
  manager_id?: string | null;
  source_warehouse_id?: string | null;
}

export interface ProductForEmployee {
  id: string;
  code: string;
  name: string;
  price_ref: number | null;
  category_id: string | null;
}

export interface ConsignmentItem {
  product_id: string;
  name: string;
  code: string;
  qty: number;
}

export interface EmployeeDashboard {
  employee_id: string;
  sales_today: number;
  consignment: ConsignmentItem[];
  branch_target: { target: number; achieved: number } | null;
}

export interface ProductPublic {
  id: string;
  product_code: string;
  name: string;
  category_id: string | null;
  sale_price_ref: number | null;
  is_active: boolean;
}

export interface ProductAdmin extends ProductPublic {
  cost_price_sar: number | null;
  supplier_id: string | null;
  base_unit?: string;
  track_batches?: boolean;
  reorder_level?: number;
}

/** وحدة قياس بديلة لمنتج (كرتون/علبة/كيلو) */
export interface ProductUom {
  id: string;
  unit_name: string;
  factor: number; // كم وحدة أساس في وحدة واحدة منها
  barcode: string | null;
}

export interface ProductUomList {
  base_unit: string;
  units: ProductUom[];
}

/** قائمة أسعار */
export interface PriceList {
  id: string;
  name: string;
  is_active: boolean;
  items_count: number;
}

/** بند قائمة أسعار (سعر للوحدة الأساس + حدّ أدنى للكمية = تدرّج) */
export interface PriceListItem {
  id?: string;
  product_id: string;
  product_name?: string;
  product_code?: string;
  base_unit?: string;
  min_qty: number;
  unit_price: number;
}

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
}

export interface Warehouse {
  id: string;
  name: string;
  location: string | null;
  is_active: boolean;
}

export interface BranchPnl {
  net_sales: number;
  cost: number;
  expenses: number;
  commissions: number;
  net_profit: number;
}

export interface CommissionResult {
  reached: boolean;
  achieved: number;
  target: number;
  commission: number;
  mode: string | null;
}

export interface PayrollResult {
  present_days: number;
  daily_rate: number;
  gross: number;
  advances: number;
  commission: number;
  net: number;
}

export interface SaleItemInput {
  product_id: string;
  qty: number;
  unit_sale_price: number;
}

export interface StockItemInput {
  product_id: string;
  qty: number;
  batch_no?: string;
  expiry?: string;
}

/** دفعة مخزون لمنتج (تتبّع الصلاحية) */
export interface ProductBatch {
  id: string;
  batch_no: string | null;
  expiry_date: string | null;
  location_type: string;
  location_id: string;
  qty: number;
}

export interface ExpiringBatch extends ProductBatch {
  product_name: string;
  product_code: string;
  days_left: number;
}

/** أمر شراء (صف القائمة) */
export interface PurchaseOrder {
  id: string;
  status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';
  total_sar: number;
  notes: string | null;
  created_at: string;
  supplier_name: string | null;
  warehouse_name: string | null;
  items_count: number;
}

export interface PurchaseOrderItem {
  id: string;
  product_id: string;
  product_name: string;
  product_code: string;
  qty_ordered: number;
  qty_received: number;
  unit_cost: number;
  uom_name: string | null;
  uom_factor: number;
}

export interface PurchaseOrderDetail {
  order: {
    id: string;
    status: PurchaseOrder['status'];
    total_sar: number;
    notes: string | null;
    created_at: string;
    warehouse_id: string;
    supplier_name: string | null;
    warehouse_name: string | null;
  };
  items: PurchaseOrderItem[];
}

/** سطر تقرير ربحية (صنف/فرع/موظف/عميل) */
export interface ProfitRow {
  id?: string;
  name: string;
  product_code?: string;
  qty?: number;
  revenue: number;
  cost: number;
  profit: number;
  margin_pct?: number;
}

/** صنف تحت نقطة إعادة الطلب */
export interface LowStockRow {
  id: string;
  name: string;
  product_code: string;
  base_unit: string;
  reorder_level: number;
  on_hand: number;
}

export interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

export interface AuditRow {
  id: string;
  action: string;
  entity: string | null;
  entity_id?: string | null;
  actor_id?: string | null;
  created_at: string;
  details?: unknown;
}

export interface AttendanceStatus {
  status: 'present' | 'absent';
}

/* ----------------------------- Accounting ----------------------------- */

export interface FinancialSummary {
  cash: number;
  card: number;
  inventory_value: number;
  employee_receivable: number;
  suppliers_payable: number;
  commissions_payable: number;
}

export interface IncomeLine {
  code: string;
  name: string;
  type: string;
  amount: number;
}

export interface IncomeStatement {
  revenue: number;
  expenses: number;
  net_profit: number;
  lines: IncomeLine[];
}

export interface BalanceSheetLine {
  code: string;
  name: string;
  balance: number;
}

export interface BalanceSheet {
  assets: BalanceSheetLine[];
  total_assets: number;
  liabilities: BalanceSheetLine[];
  total_liabilities: number;
  equity: BalanceSheetLine[];
  total_equity: number;
  net_income: number;
}

export interface TrialBalanceRow {
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface LedgerRow {
  date: string;
  memo: string | null;
  debit: number;
  credit: number;
  source: string | null;
}

export interface AccountRow {
  code: string;
  name: string;
  type: string;
}

export interface JournalLine {
  account_code: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  entry_date: string;
  memo: string | null;
  source_table: string | null;
  journal_lines: JournalLine[];
}

export interface ManualJournalLine {
  account: string;
  debit: number;
  credit: number;
}

export interface EmployeeSaleItem {
  sale_item_id: string;
  product_id: string;
  name: string;
  qty: number;
  unit_price: number;
}

export interface EmployeeRecentSale {
  sale_id: string;
  created_at: string;
  total: number;
  status: string;
  items: EmployeeSaleItem[];
}

/* ----------------------------- Monitoring ----------------------------- */

export interface EmployeeListRow {
  id: string;
  full_name: string;
  phone: string | null;
  status: string | null;
}

export interface EmployeeFileProfile {
  id: string;
  full_name: string;
  phone: string | null;
  status: string | null;
  monthly_salary_sar: number | null;
  access_code: string | null;
  is_active: boolean | null;
  hire_date: string | null;
}

export interface EmployeeFile {
  profile: EmployeeFileProfile;
  sales_total: number;
  sales_count: number;
  returns_total: number;
  cash_due: number;
  cash_settled: number;
  shortages_total: number;
  consignment_qty: number;
  consignment_retail: number;
  advances_total: number;
  commissions_total: number;
  present_days_month: number;
}

export interface ConsignmentGoodsRow {
  product_id: string;
  name: string;
  code: string;
  withdrawn: number;
  sold: number;
  returned: number;
  on_hand: number;
  variance: number;
}

export interface EmployeeConsignmentReport {
  goods: ConsignmentGoodsRow[];
  cash: {
    sales: number;
    returns: number;
    settled: number;
    shortage: number;
  };
}

/* ----------------------------- Customers (credit ledger / آجل) ----------------------------- */

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  note: string | null;
  is_active: boolean;
  balance: number;
  credit_limit?: number;
  price_list_id?: string | null;
}

/** سطر تقادم ذمم عميل (Aged Debtors) */
export interface CustomerAging {
  id: string;
  name: string;
  phone: string | null;
  credit_limit: number;
  balance: number;
  b0_30: number;
  b31_60: number;
  b61_90: number;
  b90_plus: number;
}

export interface CustomerEntry {
  id: string;
  kind: 'charge' | 'payment';
  amount: number;
  method: string | null;
  note: string | null;
  created_at: string;
}

export interface CustomerStatement {
  customer: { id: string; name: string; phone: string | null; note: string | null } | null;
  entries: CustomerEntry[];
  total_charged: number;
  total_paid: number;
  balance: number;
}

/* ----------------------------- Suppliers ----------------------------- */

export interface SupplierBalance {
  id: string;
  name: string;
  phone: string | null;
  purchased: number;
  paid: number;
  balance: number;
}

/* ----------------------------- Branch close ----------------------------- */

export interface BranchClosePreviewRow {
  product_id: string;
  name: string;
  code: string;
  expected: number;
}

export interface ReconcileCloseResult {
  transfer_id: string;
  loss_value: number;
}

/* ----------------------------- Period close / cash flow ----------------------------- */

export interface ClosePeriodResult {
  closed: boolean;
  net_income?: number;
  entry_id?: string;
}

export interface CashFlowLine {
  category: string;
  amount: number;
}

export interface CashFlow {
  inflows: CashFlowLine[];
  outflows: CashFlowLine[];
  net_change: number;
  total_in: number;
  total_out: number;
}
