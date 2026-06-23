export type Role = 'admin' | 'inventory_manager';

export interface Permissions {
  can_add_stock?: boolean;
  can_approve_requests?: boolean;
  can_transfers?: boolean;
  can_issue_wholesale?: boolean;
  can_returns?: boolean;
  [key: string]: boolean | undefined;
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
  delivery_fee: number | null;
  status: OnlineOrderStatus;
  created_at: string;
}

export interface OnlineOrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  qty: number;
  unit_price: number | null;
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

export interface EmployeeSession {
  token: string;
  profile_id: string;
  full_name: string;
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
