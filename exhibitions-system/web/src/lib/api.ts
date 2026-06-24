import { supabase } from './supabase';
import type {
  Branch,
  BranchPnl,
  CommissionResult,
  EmployeeDashboard,
  EmployeeSession,
  MyProfile,
  PayrollResult,
  ProductForEmployee,
  SaleItemInput,
  StockItemInput,
  NotificationRow,
  FinancialSummary,
  IncomeStatement,
  BalanceSheet,
  TrialBalanceRow,
  LedgerRow,
  AccountRow,
  JournalEntry,
  ManualJournalLine,
  EmployeeRecentSale,
  EmployeeListRow,
  EmployeeFile,
  EmployeeConsignmentReport,
  SupplierBalance,
  BranchClosePreviewRow,
  ReconcileCloseResult,
  CashFlow,
  ClosePeriodResult,
  PlatformTenant,
  CreateTenantResult,
  StoreInfo,
  StoreProduct,
  StoreCreateOrderPayload,
  StoreCreateOrderResult,
  StoreSettings,
  SellableProduct,
  ProductPatch,
  OnlineOrder,
  OnlineOrderItem,
  OnlineOrderStatus,
  FulfillResult,
  ManagerEmployeeRow,
} from './types';

/** Run an rpc and throw the (Arabic) error message on failure. */
async function rpc<T>(name: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(error.message || 'حدث خطأ غير متوقع');
  return data as T;
}

/* ----------------------------- Employee RPCs ----------------------------- */

export const employeeApi = {
  login: (phone: string, accessCode: string) =>
    rpc<EmployeeSession>('employee_login', {
      p_phone: phone,
      p_access_code: accessCode,
    }),

  dashboard: (token: string, branchId: string | null) =>
    rpc<EmployeeDashboard>('employee_dashboard', {
      p_token: token,
      p_branch_id: branchId,
    }),

  listProducts: (token: string) =>
    rpc<ProductForEmployee[]>('list_products_for_employee', { p_token: token }),

  listBranches: (token: string) =>
    rpc<Branch[]>('list_branches_for_employee', { p_token: token }),

  requestStock: (token: string, branchId: string, items: StockItemInput[]) =>
    rpc<string>('request_stock', {
      p_token: token,
      p_branch_id: branchId,
      p_items: items,
    }),

  withdrawConsignment: (
    token: string,
    branchId: string,
    items: StockItemInput[]
  ) =>
    rpc<null>('withdraw_consignment', {
      p_token: token,
      p_branch_id: branchId,
      p_items: items,
    }),

  createSale: (
    token: string,
    branchId: string,
    paymentMethod: 'cash' | 'card',
    items: SaleItemInput[]
  ) =>
    rpc<{ sale_id: string; total: number }>('create_sale', {
      p_token: token,
      p_branch_id: branchId,
      p_payment_method: paymentMethod,
      p_items: items,
    }),

  createSaleReturn: (
    token: string,
    saleId: string,
    items: { sale_item_id: string; qty: number }[],
    refundMethod: string | null
  ) =>
    rpc<string>('create_sale_return', {
      p_token: token,
      p_sale_id: saleId,
      p_items: items,
      p_refund_method: refundMethod,
    }),

  submitSettlement: (
    token: string,
    declaredCash: number,
    declaredCard: number
  ) =>
    rpc<string>('submit_settlement', {
      p_token: token,
      p_declared_cash: declaredCash,
      p_declared_card: declaredCard,
    }),

  notifications: (token: string) =>
    rpc<NotificationRow[]>('employee_notifications', { p_token: token }),

  markRead: (token: string, id: string) =>
    rpc<null>('employee_mark_read', { p_token: token, p_id: id }),

  recentSales: (token: string) =>
    rpc<EmployeeRecentSale[]>('employee_recent_sales', { p_token: token }),
};

/* ----------------------------- Accounting RPCs ----------------------------- */

function thisMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  return { from, to };
}

export const accountingApi = {
  financialSummary: () => rpc<FinancialSummary>('financial_summary', {}),

  incomeStatement: (from?: string, to?: string) => {
    const r = thisMonthRange();
    return rpc<IncomeStatement>('income_statement', {
      p_from: from || r.from,
      p_to: to || r.to,
    });
  },

  balanceSheet: (asOf?: string) =>
    rpc<BalanceSheet>('balance_sheet', {
      p_as_of: asOf || new Date().toISOString().slice(0, 10),
    }),

  trialBalance: (from?: string, to?: string) => {
    const r = thisMonthRange();
    return rpc<TrialBalanceRow[]>('trial_balance', {
      p_from: from || r.from,
      p_to: to || r.to,
    });
  },

  accountLedger: (code: string, from?: string, to?: string) => {
    const r = thisMonthRange();
    return rpc<LedgerRow[]>('account_ledger', {
      p_code: code,
      p_from: from || r.from,
      p_to: to || r.to,
    });
  },

  listAccounts: async (): Promise<AccountRow[]> => {
    const { data, error } = await supabase
      .from('accounts')
      .select('code,name,type')
      .order('sort');
    if (error) throw new Error(error.message || 'حدث خطأ غير متوقع');
    return (data as AccountRow[]) || [];
  },

  listJournal: async (): Promise<JournalEntry[]> => {
    const { data, error } = await supabase
      .from('journal_entries')
      .select(
        'id,entry_date,memo,source_table, journal_lines(account_code,debit,credit)'
      )
      .order('entry_date', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message || 'حدث خطأ غير متوقع');
    return (data as JournalEntry[]) || [];
  },

  postManualJournal: (
    date: string,
    memo: string,
    lines: ManualJournalLine[]
  ) =>
    rpc<string>('post_manual_journal', {
      p_date: date,
      p_memo: memo,
      p_lines: lines,
    }),

  cashFlow: (from?: string, to?: string) => {
    const r = thisMonthRange();
    return rpc<CashFlow>('cash_flow', {
      p_from: from || r.from,
      p_to: to || r.to,
    });
  },

  closePeriod: (date: string, memo: string) =>
    rpc<ClosePeriodResult>('close_period', {
      p_date: date,
      p_memo: memo,
    }),
};

/* --------------------------- Admin / IM RPCs ----------------------------- */

export const adminApi = {
  ensureMyProfile: (fullName: string) =>
    rpc<MyProfile>('ensure_my_profile', { p_full_name: fullName }),

  myProfile: () => rpc<MyProfile>('my_profile', {}),

  createEmployee: (
    fullName: string,
    phone: string,
    monthlySalary: number,
    accessCode: string | null,
    hireDate: string | null
  ) =>
    rpc<{ profile_id: string; access_code: string }>('create_employee', {
      p_full_name: fullName,
      p_phone: phone,
      p_monthly_salary: monthlySalary,
      p_access_code: accessCode,
      p_hire_date: hireDate,
    }),

  setImPermissions: (
    profileId: string,
    addStock: boolean,
    approve: boolean,
    transfers: boolean,
    wholesale: boolean,
    returns: boolean,
    manageEmployees: boolean,
    manageStore: boolean
  ) =>
    rpc<null>('set_im_permissions', {
      p_profile_id: profileId,
      p_add_stock: addStock,
      p_approve: approve,
      p_transfers: transfers,
      p_wholesale: wholesale,
      p_returns: returns,
      p_manage_employees: manageEmployees,
      p_manage_store: manageStore,
    }),

  /* --------------------------- Manager (delegated) --------------------------- */

  managerListEmployees: () =>
    rpc<ManagerEmployeeRow[]>('mgr_list_employees', {}),

  setUserRole: (profileId: string, role: string, status: string) =>
    rpc<null>('set_user_role', {
      p_profile_id: profileId,
      p_role: role,
      p_status: status,
    }),

  receiveStock: (
    warehouseId: string,
    supplierId: string,
    items: StockItemInput[]
  ) =>
    rpc<string>('receive_stock', {
      p_warehouse_id: warehouseId,
      p_supplier_id: supplierId,
      p_items: items,
    }),

  reviewStockRequest: (
    requestId: string,
    action: 'approve' | 'reject',
    approvals: { product_id: string; qty_approved: number }[]
  ) =>
    rpc<string>('review_stock_request', {
      p_request_id: requestId,
      p_action: action,
      p_approvals: approvals,
    }),

  createWholesaleOrder: (
    customerName: string,
    customerPhone: string,
    warehouseId: string,
    paymentMethod: string,
    items: { product_id: string; qty: number; unit_price: number }[]
  ) =>
    rpc<{ order_id: string; total: number }>('create_wholesale_order', {
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_warehouse_id: warehouseId,
      p_payment_method: paymentMethod,
      p_items: items,
    }),

  closeBranch: (branchId: string) =>
    rpc<string>('close_branch', { p_branch_id: branchId }),

  branchPnl: (branchId: string) =>
    rpc<BranchPnl>('branch_pnl', { p_branch_id: branchId }),

  computeBranchCommission: (branchId: string) =>
    rpc<CommissionResult>('compute_branch_commission', {
      p_branch_id: branchId,
    }),

  computePayroll: (employeeId: string, periodMonth: string) =>
    rpc<PayrollResult>('compute_payroll', {
      p_employee_id: employeeId,
      p_period_month: periodMonth,
    }),

  setCommissionStatus: (
    branchId: string,
    status: 'approved' | 'paid' | 'cancelled'
  ) =>
    rpc<number>('set_commission_status', {
      p_branch_id: branchId,
      p_status: status,
    }),

  recordAttendance: (
    employeeId: string,
    workDate: string,
    status: 'present' | 'absent',
    branchId: string | null
  ) =>
    rpc<null>('record_attendance', {
      p_employee_id: employeeId,
      p_work_date: workDate,
      p_status: status,
      p_branch_id: branchId,
    }),

  markNotificationRead: (id: string) =>
    rpc<null>('mark_notification_read', { p_id: id }),

  /* --------------------------- Monitoring --------------------------- */

  listEmployees: async (): Promise<EmployeeListRow[]> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,full_name,phone,status')
      .eq('role', 'employee')
      .order('full_name');
    if (error) throw new Error(error.message || 'حدث خطأ غير متوقع');
    return (data as EmployeeListRow[]) || [];
  },

  employeeFile: (id: string) =>
    rpc<EmployeeFile>('employee_file', { p_employee_id: id }),

  employeeConsignmentReport: (id: string) =>
    rpc<EmployeeConsignmentReport>('employee_consignment_report', {
      p_employee_id: id,
    }),

  /* --------------------------- Suppliers --------------------------- */

  supplierBalances: () => rpc<SupplierBalance[]>('supplier_balances', {}),

  paySupplier: (
    id: string,
    amount: number,
    method: 'cash' | 'card',
    notes: string
  ) =>
    rpc<string>('pay_supplier', {
      p_supplier_id: id,
      p_amount: amount,
      p_method: method,
      p_notes: notes,
    }),

  /* --------------------------- Branch close --------------------------- */

  branchClosePreview: (id: string) =>
    rpc<BranchClosePreviewRow[]>('branch_close_preview', { p_branch_id: id }),

  reconcileAndCloseBranch: (
    id: string,
    counts: { product_id: string; received: number }[]
  ) =>
    rpc<ReconcileCloseResult>('reconcile_and_close_branch', {
      p_branch_id: id,
      p_counts: counts,
    }),

  /* --------------------------- Branding (tenant admin) --------------------------- */

  updateTenantBranding: (
    tenantId: string,
    brandName: string,
    logoUrl: string | null,
    primaryColor: string
  ) =>
    rpc<null>('update_tenant_branding', {
      p_tenant_id: tenantId,
      p_brand_name: brandName,
      p_logo_url: logoUrl,
      p_primary_color: primaryColor,
    }),
};

/* --------------------------- Online Store (public) ----------------------------- */

export const storeApi = {
  info: (slug: string) =>
    rpc<StoreInfo | null>('store_info', { p_slug: slug }),

  listProducts: (slug: string) =>
    rpc<StoreProduct[]>('store_list_products', { p_slug: slug }),

  createOrder: (payload: StoreCreateOrderPayload) =>
    rpc<StoreCreateOrderResult>('store_create_order', {
      p_slug: payload.slug,
      p_customer_name: payload.customer_name,
      p_customer_phone: payload.customer_phone,
      p_address: payload.address,
      p_payment_method: payload.payment_method,
      p_items: payload.items,
    }),
};

/* --------------------------- Online Store (admin) ----------------------------- */

export const adminStoreApi = {
  getSettings: async (tenantId: string): Promise<StoreSettings> => {
    const { data, error } = await supabase
      .from('tenants')
      .select(
        'id,slug,store_enabled,store_description,store_whatsapp,delivery_fee,cod_enabled'
      )
      .eq('id', tenantId)
      .single();
    if (error) throw new Error(error.message || 'حدث خطأ غير متوقع');
    return data as StoreSettings;
  },

  // SAVE store settings via RPC so both owner and store-manager work (RLS-safe).
  updateSettings: (
    patch: Partial<Omit<StoreSettings, 'id' | 'slug'>>
  ): Promise<null> =>
    rpc<null>('update_store_settings', {
      p_enabled: !!patch.store_enabled,
      p_description: patch.store_description ?? null,
      p_whatsapp: patch.store_whatsapp ?? null,
      p_delivery_fee: patch.delivery_fee ?? 0,
      p_cod: !!patch.cod_enabled,
    }),

  // List products via RPC (no cost exposed) so managers can read them.
  listSellableProducts: () =>
    rpc<SellableProduct[]>('store_admin_products', {}),

  // Save a product's store fields via RPC (RLS-safe for managers).
  updateProduct: (id: string, patch: ProductPatch): Promise<null> =>
    rpc<null>('store_set_product', {
      p_id: id,
      p_online_enabled: !!patch.online_enabled,
      p_online_price: patch.online_price ?? null,
      p_image_url: patch.image_url ?? null,
      p_description: patch.description ?? null,
    }),

  listOrders: async (): Promise<OnlineOrder[]> => {
    const { data, error } = await supabase
      .from('online_orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message || 'حدث خطأ غير متوقع');
    return (data as OnlineOrder[]) || [];
  },

  getOrderItems: async (orderId: string): Promise<OnlineOrderItem[]> => {
    const { data, error } = await supabase
      .from('online_order_items')
      .select('*, products(name,product_code)')
      .eq('order_id', orderId);
    if (error) throw new Error(error.message || 'حدث خطأ غير متوقع');
    return (data as OnlineOrderItem[]) || [];
  },

  setOrderStatus: (id: string, status: Extract<OnlineOrderStatus, 'confirmed' | 'cancelled'>) =>
    rpc<null>('set_online_order_status', {
      p_order_id: id,
      p_status: status,
    }),

  fulfillOrder: (id: string, warehouseId: string) =>
    rpc<FulfillResult>('fulfill_online_order', {
      p_order_id: id,
      p_warehouse_id: warehouseId,
    }),

  listWarehouses: async (): Promise<{ id: string; name: string }[]> => {
    const { data, error } = await supabase
      .from('warehouses')
      .select('id,name')
      .order('name');
    if (error) throw new Error(error.message || 'حدث خطأ غير متوقع');
    return (data as { id: string; name: string }[]) || [];
  },
};

/* --------------------------- Platform owner RPCs ----------------------------- */

export const platformApi = {
  listTenants: () => rpc<PlatformTenant[]>('platform_list_tenants', {}),

  createTenant: (payload: {
    name: string;
    adminEmail: string;
    adminPassword: string;
    brandName: string;
    primaryColor: string;
    subscriptionExpires: string | null;
  }) =>
    rpc<CreateTenantResult>('create_tenant', {
      p_name: payload.name,
      p_admin_email: payload.adminEmail,
      p_admin_password: payload.adminPassword,
      p_brand_name: payload.brandName,
      p_primary_color: payload.primaryColor,
      p_subscription_expires: payload.subscriptionExpires,
    }),

  setTenantStatus: (
    tenantId: string,
    status: 'active' | 'suspended',
    subStatus?: 'trial' | 'active' | 'expired' | null,
    expires?: string | null
  ) =>
    rpc<null>('set_tenant_status', {
      p_tenant_id: tenantId,
      p_status: status,
      p_subscription_status: subStatus ?? null,
      p_expires: expires ?? null,
    }),

  updateTenantBranding: (
    tenantId: string,
    brandName: string,
    logoUrl: string | null,
    primaryColor: string
  ) =>
    rpc<null>('update_tenant_branding', {
      p_tenant_id: tenantId,
      p_brand_name: brandName,
      p_logo_url: logoUrl,
      p_primary_color: primaryColor,
    }),
};
