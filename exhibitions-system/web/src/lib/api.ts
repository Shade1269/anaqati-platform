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
    returns: boolean
  ) =>
    rpc<null>('set_im_permissions', {
      p_profile_id: profileId,
      p_add_stock: addStock,
      p_approve: approve,
      p_transfers: transfers,
      p_wholesale: wholesale,
      p_returns: returns,
    }),

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
};
