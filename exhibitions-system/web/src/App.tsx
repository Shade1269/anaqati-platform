import { Navigate, Route, Routes } from 'react-router-dom';
import Landing from './pages/Landing';

// Public storefront (no auth)
import Storefront from './pages/store/Storefront';

// Employee
import EmployeeLogin from './pages/employee/EmployeeLogin';
import EmployeeLayout from './pages/employee/EmployeeLayout';
import EmployeeDashboard from './pages/employee/EmployeeDashboard';
import EmployeePos from './pages/employee/EmployeePos';
import EmployeeRequestStock from './pages/employee/EmployeeRequestStock';
import EmployeeWithdraw from './pages/employee/EmployeeWithdraw';
import EmployeeSettlement from './pages/employee/EmployeeSettlement';
import EmployeeNotifications from './pages/employee/EmployeeNotifications';
import EmployeeReturns from './pages/employee/EmployeeReturns';

// Admin / IM
import AdminLogin from './pages/admin/AdminLogin';
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminProducts from './pages/admin/AdminProducts';
import AdminCatalog from './pages/admin/AdminCatalog';
import AdminBranches from './pages/admin/AdminBranches';
import AdminEmployees from './pages/admin/AdminEmployees';
import AdminRequests from './pages/admin/AdminRequests';
import AdminFinance from './pages/admin/AdminFinance';
import AdminWholesale from './pages/admin/AdminWholesale';
import AdminInventory from './pages/admin/AdminInventory';
import AdminReceiveStock from './pages/admin/AdminReceiveStock';
import AdminAudit from './pages/admin/AdminAudit';
import AdminMonitoring from './pages/admin/AdminMonitoring';
import AdminEmployeeFile from './pages/admin/AdminEmployeeFile';
import AdminSuppliers from './pages/admin/AdminSuppliers';
import RequireAdmin from './pages/admin/RequireAdmin';
import AccountingOverview from './pages/admin/accounting/AccountingOverview';
import AccountingIncome from './pages/admin/accounting/AccountingIncome';
import AccountingBalance from './pages/admin/accounting/AccountingBalance';
import AccountingTrialBalance from './pages/admin/accounting/AccountingTrialBalance';
import AccountingLedger from './pages/admin/accounting/AccountingLedger';
import AccountingJournal from './pages/admin/accounting/AccountingJournal';
import AccountingCashFlow from './pages/admin/accounting/AccountingCashFlow';
import AdminBranding from './pages/admin/AdminBranding';
import AdminStoreSettings from './pages/admin/store/AdminStoreSettings';
import AdminStoreProducts from './pages/admin/store/AdminStoreProducts';
import AdminStoreOrders from './pages/admin/store/AdminStoreOrders';

// Platform owner (white-label SaaS)
import OwnerLogin from './pages/platform/OwnerLogin';
import PlatformLayout from './pages/platform/PlatformLayout';
import PlatformTenants from './pages/platform/PlatformTenants';
import RequirePlatform from './pages/platform/RequirePlatform';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />

      {/* Public storefront (no auth) */}
      <Route path="/store/:slug" element={<Storefront />} />

      {/* Employee */}
      <Route path="/employee/login" element={<EmployeeLogin />} />
      <Route path="/employee" element={<EmployeeLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<EmployeeDashboard />} />
        <Route path="pos" element={<EmployeePos />} />
        <Route path="request-stock" element={<EmployeeRequestStock />} />
        <Route path="withdraw" element={<EmployeeWithdraw />} />
        <Route path="settlement" element={<EmployeeSettlement />} />
        <Route path="returns" element={<EmployeeReturns />} />
        <Route path="notifications" element={<EmployeeNotifications />} />
      </Route>

      {/* Admin / IM */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        {/* Admin-only management pages */}
        <Route path="dashboard" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
        <Route path="products" element={<RequireAdmin><AdminProducts /></RequireAdmin>} />
        <Route path="catalog" element={<RequireAdmin><AdminCatalog /></RequireAdmin>} />
        <Route path="branches" element={<RequireAdmin><AdminBranches /></RequireAdmin>} />
        <Route path="employees" element={<RequireAdmin><AdminEmployees /></RequireAdmin>} />
        <Route path="monitoring" element={<RequireAdmin><AdminMonitoring /></RequireAdmin>} />
        <Route path="monitoring/:employeeId" element={<RequireAdmin><AdminEmployeeFile /></RequireAdmin>} />
        <Route path="suppliers" element={<RequireAdmin><AdminSuppliers /></RequireAdmin>} />
        <Route path="finance" element={<RequireAdmin><AdminFinance /></RequireAdmin>} />
        <Route path="audit" element={<RequireAdmin><AdminAudit /></RequireAdmin>} />
        <Route path="branding" element={<RequireAdmin><AdminBranding /></RequireAdmin>} />

        {/* Online store — admin only */}
        <Route path="store/settings" element={<RequireAdmin><AdminStoreSettings /></RequireAdmin>} />
        <Route path="store/products" element={<RequireAdmin><AdminStoreProducts /></RequireAdmin>} />
        <Route path="store/orders" element={<RequireAdmin><AdminStoreOrders /></RequireAdmin>} />

        {/* Operations — accessible to inventory_manager per permissions */}
        <Route path="requests" element={<AdminRequests />} />
        <Route path="wholesale" element={<AdminWholesale />} />
        <Route path="inventory" element={<AdminInventory />} />
        <Route path="receive-stock" element={<AdminReceiveStock />} />

        {/* Accounting — admin only */}
        <Route path="accounting" element={<RequireAdmin><AccountingOverview /></RequireAdmin>} />
        <Route path="accounting/income" element={<RequireAdmin><AccountingIncome /></RequireAdmin>} />
        <Route path="accounting/balance" element={<RequireAdmin><AccountingBalance /></RequireAdmin>} />
        <Route path="accounting/trial-balance" element={<RequireAdmin><AccountingTrialBalance /></RequireAdmin>} />
        <Route path="accounting/ledger" element={<RequireAdmin><AccountingLedger /></RequireAdmin>} />
        <Route path="accounting/journal" element={<RequireAdmin><AccountingJournal /></RequireAdmin>} />
        <Route path="accounting/cashflow" element={<RequireAdmin><AccountingCashFlow /></RequireAdmin>} />
      </Route>

      {/* Platform owner (private entrance + panel) */}
      <Route path="/owner" element={<OwnerLogin />} />
      <Route
        path="/platform"
        element={
          <RequirePlatform>
            <PlatformLayout />
          </RequirePlatform>
        }
      >
        <Route index element={<PlatformTenants />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
