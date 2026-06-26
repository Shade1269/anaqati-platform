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
  MenuCategory,
  DiningTable,
  QuickSession,
  ShiftZ,
  RestaurantSettings,
  RestaurantReport,
  SessionDetail,
  KdsOrder,
  NewOrderItem,
  Ingredient,
  RecipeLine,
  MarketListing,
  MarketBrowseItem,
  MarketOrderRow,
  MarketOrderDetail,
  WorkCenter,
  MfgMaterial,
  MfgProduct,
  MfgBomLine,
  MfgRoutingOp,
  MfgEstimate,
  MfgWorkOrderRow,
  MfgWorkOrderDetail,
  MfgMold,
  Customer,
  CustomerStatement,
  EmployeePermissions,
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

  retailReport: (from: string, to: string) =>
    rpc<import('./types').RetailReport>('retail_report', { p_from: from, p_to: to }),
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
    manageStore: boolean,
    manageRestaurant: boolean = false,
    manageMarket: boolean = false,
    manageManufacturing: boolean = false
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
      p_manage_restaurant: manageRestaurant,
      p_manage_market: manageMarket,
      p_manage_manufacturing: manageManufacturing,
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

  /* --------------------------- Employee fine-grained permissions --------------------------- */

  getEmployeePerms: (profileId: string) =>
    rpc<EmployeePermissions>('employee_perms_get', { p_profile_id: profileId }),

  setEmployeePerms: (profileId: string, p: EmployeePermissions) =>
    rpc<null>('employee_perms_set', {
      p_profile_id: profileId,
      p_sell: p.can_sell,
      p_return: p.can_return,
      p_request_stock: p.can_request_stock,
      p_withdraw: p.can_withdraw,
      p_settle: p.can_settle,
      p_waiter: p.can_waiter,
      p_kitchen: p.can_kitchen,
    }),

  /* --------------------------- Branding (tenant admin) --------------------------- */

  updateTenantBranding: (
    tenantId: string,
    brandName: string,
    logoUrl: string | null,
    primaryColor: string,
    currency?: string,
    secondaryCurrency?: string | null,
    fxRate?: number | null
  ) =>
    rpc<null>('update_tenant_branding', {
      p_tenant_id: tenantId,
      p_brand_name: brandName,
      p_logo_url: logoUrl,
      p_primary_color: primaryColor,
      p_currency: currency ?? null,
      p_secondary_currency: secondaryCurrency ?? null,
      p_fx_rate: fxRate ?? null,
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
    businessType?: 'retail' | 'restaurant' | 'manufacturing';
    businessSubtype?: 'general' | 'plastics' | 'wood' | 'metal';
  }) =>
    rpc<CreateTenantResult>('create_tenant', {
      p_name: payload.name,
      p_admin_email: payload.adminEmail,
      p_admin_password: payload.adminPassword,
      p_brand_name: payload.brandName,
      p_primary_color: payload.primaryColor,
      p_subscription_expires: payload.subscriptionExpires,
      p_business_type: payload.businessType ?? 'retail',
      p_business_subtype: payload.businessSubtype ?? 'general',
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
    primaryColor: string,
    currency?: string,
    secondaryCurrency?: string | null,
    fxRate?: number | null
  ) =>
    rpc<null>('update_tenant_branding', {
      p_tenant_id: tenantId,
      p_brand_name: brandName,
      p_logo_url: logoUrl,
      p_primary_color: primaryColor,
      p_currency: currency ?? null,
      p_secondary_currency: secondaryCurrency ?? null,
      p_fx_rate: fxRate ?? null,
    }),
};

/* --------------------------- Restaurant / Café -----------------------------
 * كل الدوال تقبل token اختياري: null = أدمن/مدير (جلسة Supabase)، أو توكن النادل.
 * نفس RPC يخدم الطرفين (الباك-إند يحلّ السياق عبر _rest_ctx).
 * -------------------------------------------------------------------------- */

export const restaurantApi = {
  menu: (token: string | null = null) =>
    rpc<MenuCategory[]>('restaurant_menu', { p_token: token }),

  tables: (token: string | null = null) =>
    rpc<DiningTable[]>('restaurant_tables', { p_token: token }),

  quickSessions: (token: string | null = null) =>
    rpc<QuickSession[]>('quick_sessions', { p_token: token }),

  shiftCurrent: (token: string | null = null) =>
    rpc<ShiftZ | null>('shift_current', { p_token: token }),

  shiftOpen: (openingFloat: number, token: string | null = null) =>
    rpc<ShiftZ>('shift_open', { p_opening_float: openingFloat, p_token: token }),

  shiftClose: (declaredCash: number, note: string | null, token: string | null = null) =>
    rpc<ShiftZ>('shift_close', { p_declared_cash: declaredCash, p_note: note, p_token: token }),

  shiftZ: (shiftId: string, token: string | null = null) =>
    rpc<ShiftZ>('shift_z', { p_shift_id: shiftId, p_token: token }),

  openQuick: (
    orderType: 'takeaway' | 'delivery',
    customer: { name?: string | null; phone?: string | null; address?: string | null; deliveryFee?: number },
    token: string | null = null
  ) =>
    rpc<{ session_id: string; session_no: string }>('open_quick_session', {
      p_order_type: orderType,
      p_customer_name: customer.name ?? null,
      p_customer_phone: customer.phone ?? null,
      p_address: customer.address ?? null,
      p_delivery_fee: customer.deliveryFee ?? 0,
      p_token: token,
    }),

  sessionDetail: (sessionId: string, token: string | null = null) =>
    rpc<SessionDetail>('session_detail', { p_session_id: sessionId, p_token: token }),

  openTable: (tableId: string, guests: number, token: string | null = null) =>
    rpc<{ session_id: string; session_no: string; reused: boolean }>('open_table', {
      p_table_id: tableId,
      p_guests: guests,
      p_token: token,
    }),

  addOrder: (
    sessionId: string,
    items: NewOrderItem[],
    note: string | null,
    token: string | null = null
  ) =>
    rpc<{ order_id: string; order_no: string; added: number }>('add_order', {
      p_session_id: sessionId,
      p_items: items,
      p_note: note,
      p_token: token,
    }),

  kdsList: (token: string | null = null) =>
    rpc<KdsOrder[]>('kds_list', { p_token: token }),

  kdsSetStatus: (
    orderId: string,
    status: 'new' | 'preparing' | 'ready' | 'served' | 'cancelled',
    token: string | null = null
  ) =>
    rpc<null>('kds_set_order_status', { p_order_id: orderId, p_status: status, p_token: token }),

  closeBill: (
    sessionId: string,
    paymentMethod: 'cash' | 'card',
    opts: { discountType?: 'none' | 'percent' | 'amount'; discountValue?: number; tip?: number } = {},
    token: string | null = null
  ) =>
    rpc<{
      session_id: string;
      subtotal?: number;
      discount?: number;
      service?: number;
      tax?: number;
      tip?: number;
      delivery_fee?: number;
      charged?: number;
      payment_method: string;
    }>('close_table_bill', {
      p_session_id: sessionId,
      p_payment_method: paymentMethod,
      p_discount_type: opts.discountType ?? 'none',
      p_discount_value: opts.discountValue ?? 0,
      p_tip: opts.tip ?? 0,
      p_token: token,
    }),

  settings: (token: string | null = null) =>
    rpc<RestaurantSettings>('restaurant_settings', { p_token: token }),

  setSettings: (servicePct: number, taxPct: number) =>
    rpc<null>('set_restaurant_settings', { p_service_pct: servicePct, p_tax_pct: taxPct }),

  report: (from: string, to: string) =>
    rpc<RestaurantReport>('restaurant_report', { p_from: from, p_to: to }),

  voidItem: (itemId: string, reason: string, token: string | null = null) =>
    rpc<null>('void_order_item', { p_item_id: itemId, p_reason: reason, p_token: token }),

  transferTable: (sessionId: string, toTableId: string, token: string | null = null) =>
    rpc<null>('transfer_table', { p_session_id: sessionId, p_to_table_id: toTableId, p_token: token }),

  mergeTables: (fromSessionId: string, intoSessionId: string, token: string | null = null) =>
    rpc<null>('merge_tables', {
      p_from_session_id: fromSessionId,
      p_into_session_id: intoSessionId,
      p_token: token,
    }),

  splitSession: (sessionId: string, itemIds: string[], token: string | null = null) =>
    rpc<{ new_session_id: string; new_session_no: string }>('split_session', {
      p_session_id: sessionId,
      p_item_ids: itemIds,
      p_token: token,
    }),

  /* ---- Management (admin / manager with can_manage_restaurant) ---- */
  setCategory: (id: string | null, name: string, sort: number, active: boolean) =>
    rpc<string>('menu_set_category', { p_id: id, p_name: name, p_sort: sort, p_active: active }),

  setItem: (
    id: string | null,
    categoryId: string | null,
    name: string,
    price: number,
    description: string | null,
    imageUrl: string | null,
    available: boolean,
    sort: number
  ) =>
    rpc<string>('menu_set_item', {
      p_id: id,
      p_category_id: categoryId,
      p_name: name,
      p_price: price,
      p_description: description,
      p_image_url: imageUrl,
      p_available: available,
      p_sort: sort,
    }),

  deleteItem: (id: string) => rpc<null>('menu_delete_item', { p_id: id }),

  setOption: (
    id: string | null,
    itemId: string,
    group: string,
    name: string,
    delta: number,
    sort: number
  ) =>
    rpc<string>('menu_set_option', {
      p_id: id,
      p_item_id: itemId,
      p_group: group,
      p_name: name,
      p_delta: delta,
      p_sort: sort,
    }),

  deleteOption: (id: string) => rpc<null>('menu_delete_option', { p_id: id }),

  setTable: (
    id: string | null,
    label: string,
    section: string | null,
    seats: number,
    active: boolean
  ) =>
    rpc<string>('table_set', {
      p_id: id,
      p_label: label,
      p_section: section,
      p_seats: seats,
      p_active: active,
    }),

  /* ---- Ingredients / inventory ---- */
  ingredientsList: (lowOnly = false) =>
    rpc<Ingredient[]>('ingredients_list', { p_low_only: lowOnly }),

  setIngredient: (
    id: string | null,
    name: string,
    unit: string,
    reorder: number,
    cost: number,
    active: boolean
  ) =>
    rpc<string>('ingredient_set', {
      p_id: id,
      p_name: name,
      p_unit: unit,
      p_reorder: reorder,
      p_cost: cost,
      p_active: active,
    }),

  receiveIngredient: (
    ingredientId: string,
    qty: number,
    unitCost: number,
    paymentMethod: 'cash' | 'card',
    note: string | null
  ) =>
    rpc<{ ingredient_id: string; new_qty: number; amount: number }>('ingredient_receive', {
      p_ingredient_id: ingredientId,
      p_qty: qty,
      p_unit_cost: unitCost,
      p_payment_method: paymentMethod,
      p_note: note,
    }),

  adjustIngredient: (
    ingredientId: string,
    newQty: number,
    reason: 'adjustment' | 'waste',
    note: string | null
  ) =>
    rpc<null>('ingredient_adjust', {
      p_ingredient_id: ingredientId,
      p_new_qty: newQty,
      p_reason: reason,
      p_note: note,
    }),

  /* ---- Recipes (menu item → ingredients) ---- */
  recipeGet: (menuItemId: string) =>
    rpc<RecipeLine[]>('recipe_get', { p_menu_item_id: menuItemId }),

  recipeSet: (menuItemId: string, items: { ingredient_id: string; qty: number }[]) =>
    rpc<null>('recipe_set', { p_menu_item_id: menuItemId, p_items: items }),
};

/* --------------------------- QR self-ordering (public) ----------------------------- */

export const qrApi = {
  info: (tenantId: string, tableId: string) =>
    rpc<import('./types').QrInfo>('qr_info', { p_tenant: tenantId, p_table: tableId }),

  menu: (tenantId: string) =>
    rpc<MenuCategory[]>('qr_menu', { p_tenant: tenantId }),

  placeOrder: (
    tenantId: string,
    tableId: string,
    items: NewOrderItem[],
    note: string | null
  ) =>
    rpc<{ order_no: string; session_no: string; added: number }>('qr_place_order', {
      p_tenant: tenantId,
      p_table: tableId,
      p_items: items,
      p_note: note,
    }),
};

/* --------------------------- Restaurant online ordering (public, menu-based) ----------------------------- */

export const restaurantOnlineApi = {
  info: (tenantId: string) =>
    rpc<import('./types').RestaurantPublicInfo>('restaurant_public_info', { p_tenant: tenantId }),

  menu: (tenantId: string) => rpc<MenuCategory[]>('qr_menu', { p_tenant: tenantId }),

  order: (
    tenantId: string,
    orderType: 'takeaway' | 'delivery',
    customer: { name: string; phone: string; address: string },
    items: NewOrderItem[],
    note: string | null
  ) =>
    rpc<{ order_no: string; session_no: string; items_total: number; delivery_fee: number }>('restaurant_online_order', {
      p_tenant: tenantId,
      p_order_type: orderType,
      p_name: customer.name,
      p_phone: customer.phone,
      p_address: customer.address,
      p_items: items,
      p_note: note,
    }),
};

/* --------------------------- Internal Market (B2B) ----------------------------- */

export const marketApi = {
  myListings: () => rpc<MarketListing[]>('market_my_listings', {}),

  setListing: (
    id: string | null,
    name: string,
    category: string | null,
    description: string | null,
    unit: string,
    price: number,
    minQty: number,
    imageUrl: string | null,
    active: boolean
  ) =>
    rpc<string>('market_set_listing', {
      p_id: id,
      p_name: name,
      p_category: category,
      p_description: description,
      p_unit: unit,
      p_price: price,
      p_min_qty: minQty,
      p_image_url: imageUrl,
      p_active: active,
    }),

  deleteListing: (id: string) => rpc<null>('market_delete_listing', { p_id: id }),

  browse: (category: string | null = null) =>
    rpc<MarketBrowseItem[]>('market_browse', { p_category: category }),

  placeOrder: (
    sellerTenantId: string,
    items: { listing_id: string; qty: number }[],
    paymentMethod: 'cash' | 'credit',
    note: string | null
  ) =>
    rpc<{ order_id: string; order_no: string; total: number }>('market_place_order', {
      p_seller_tenant: sellerTenantId,
      p_items: items,
      p_payment_method: paymentMethod,
      p_note: note,
    }),

  incoming: () => rpc<MarketOrderRow[]>('market_incoming_orders', {}),
  outgoing: () => rpc<MarketOrderRow[]>('market_outgoing_orders', {}),
  orderDetail: (id: string) => rpc<MarketOrderDetail>('market_order_detail', { p_order_id: id }),
  setOrderStatus: (id: string, status: 'confirmed' | 'fulfilled' | 'cancelled') =>
    rpc<null>('market_set_order_status', { p_order_id: id, p_status: status }),
};

/* --------------------------- Customers (credit ledger / آجل) ----------------------------- */

export const customersApi = {
  list: () => rpc<Customer[]>('customers_list', {}),

  set: (
    id: string | null,
    name: string,
    phone: string | null,
    note: string | null,
    active: boolean
  ) =>
    rpc<string>('customer_set', {
      p_id: id,
      p_name: name,
      p_phone: phone,
      p_note: note,
      p_active: active,
    }),

  charge: (customerId: string, amount: number, note: string | null) =>
    rpc<null>('customer_charge', {
      p_customer_id: customerId,
      p_amount: amount,
      p_note: note,
    }),

  payment: (
    customerId: string,
    amount: number,
    method: 'cash' | 'card',
    note: string | null
  ) =>
    rpc<null>('customer_payment', {
      p_customer_id: customerId,
      p_amount: amount,
      p_method: method,
      p_note: note,
    }),

  statement: (customerId: string) =>
    rpc<CustomerStatement>('customer_statement', { p_customer_id: customerId }),
};

/* --------------------------- Manufacturing (job-shop) ----------------------------- */

export const mfgApi = {
  /* materials */
  materialsList: (lowOnly = false) => rpc<MfgMaterial[]>('mfg_materials_list', { p_low_only: lowOnly }),
  setMaterial: (id: string | null, name: string, unit: string, reorder: number, cost: number, active: boolean, density: number | null = null) =>
    rpc<string>('mfg_material_set', { p_id: id, p_name: name, p_unit: unit, p_reorder: reorder, p_cost: cost, p_active: active, p_density: density }),
  receiveMaterial: (id: string, qty: number, unitCost: number, pm: 'cash' | 'card', note: string | null) =>
    rpc<{ new_qty: number }>('mfg_material_receive', { p_material_id: id, p_qty: qty, p_unit_cost: unitCost, p_payment_method: pm, p_note: note }),
  adjustMaterial: (id: string, newQty: number, reason: 'adjustment' | 'waste', note: string | null) =>
    rpc<null>('mfg_material_adjust', { p_material_id: id, p_new_qty: newQty, p_reason: reason, p_note: note }),

  /* work centers */
  workCentersList: () => rpc<WorkCenter[]>('mfg_workcenters_list', {}),
  setWorkCenter: (id: string | null, name: string, rate: number, active: boolean) =>
    rpc<string>('mfg_workcenter_set', { p_id: id, p_name: name, p_rate: rate, p_active: active }),

  /* products + BOM + routing */
  productsList: () => rpc<MfgProduct[]>('mfg_products_list', {}),
  setProduct: (id: string | null, name: string, unit: string, active: boolean) =>
    rpc<string>('mfg_product_set', { p_id: id, p_name: name, p_unit: unit, p_active: active }),
  deleteProduct: (id: string) => rpc<null>('mfg_product_delete', { p_id: id }),
  bomGet: (productId: string) => rpc<MfgBomLine[]>('mfg_bom_get', { p_product_id: productId }),
  bomSet: (productId: string, items: { material_id: string; qty: number }[]) =>
    rpc<null>('mfg_bom_set', { p_product_id: productId, p_items: items }),
  routingGet: (productId: string) => rpc<MfgRoutingOp[]>('mfg_routing_get', { p_product_id: productId }),
  routingSet: (productId: string, ops: { operation: string; work_center_id: string | null; run_minutes: number; labor_rate: number }[]) =>
    rpc<null>('mfg_routing_set', { p_product_id: productId, p_ops: ops }),

  /* estimate + work orders */
  estimate: (productId: string, qty: number, markup: number) =>
    rpc<MfgEstimate>('mfg_estimate', { p_product_id: productId, p_qty: qty, p_markup: markup }),
  woCreate: (productId: string, qty: number, customer: string | null, markup: number, note: string | null) =>
    rpc<{ id: string; wo_no: string }>('mfg_wo_create', { p_product_id: productId, p_qty: qty, p_customer: customer, p_markup: markup, p_note: note }),
  woList: (status: string | null = null) => rpc<MfgWorkOrderRow[]>('mfg_wo_list', { p_status: status }),
  woDetail: (id: string) => rpc<MfgWorkOrderDetail>('mfg_wo_detail', { p_id: id }),
  woSetStatus: (id: string, status: 'released' | 'in_progress' | 'done' | 'cancelled') =>
    rpc<null>('mfg_wo_set_status', { p_id: id, p_status: status }),
  woIssueMaterial: (id: string, materialId: string, qty: number) =>
    rpc<null>('mfg_wo_issue_material', { p_id: id, p_material_id: materialId, p_qty: qty }),
  woLogLabor: (id: string, workCenterId: string | null, operation: string, minutes: number, laborRate: number) =>
    rpc<null>('mfg_wo_log_labor', { p_id: id, p_work_center_id: workCenterId, p_operation: operation, p_minutes: minutes, p_labor_rate: laborRate, p_employee_id: null }),
  woInvoice: (id: string, pm: 'cash' | 'card' | 'credit') =>
    rpc<{ price: number; actual_total: number }>('mfg_wo_invoice', { p_id: id, p_payment_method: pm }),
  woRecordOutput: (id: string, produced: number, scrap: number) =>
    rpc<null>('mfg_wo_record_output', { p_id: id, p_produced: produced, p_scrap: scrap }),

  /* molds (plastics) */
  moldsList: () => rpc<MfgMold[]>('mfg_molds_list', {}),
  setMold: (id: string | null, name: string, cavities: number, productId: string | null, note: string | null, active: boolean) =>
    rpc<string>('mfg_mold_set', { p_id: id, p_name: name, p_cavities: cavities, p_product_id: productId, p_note: note, p_active: active }),
  deleteMold: (id: string) => rpc<null>('mfg_mold_delete', { p_id: id }),
};
