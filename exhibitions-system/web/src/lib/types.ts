export type Role = 'admin' | 'inventory_manager';

export interface Permissions {
  can_add_stock?: boolean;
  can_approve_requests?: boolean;
  can_transfers?: boolean;
  can_issue_wholesale?: boolean;
  can_returns?: boolean;
  [key: string]: boolean | undefined;
}

export interface MyProfile {
  id: string;
  full_name: string;
  role: Role;
  status: string;
  permissions: Permissions | null;
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
