import { Navigate, Route, Routes } from 'react-router-dom';

// Public storefront (no auth)
import Storefront from './pages/store/Storefront';
import QrOrder from './pages/restaurant/QrOrder';
import RestaurantOnlineMenu from './pages/restaurant/RestaurantOnlineMenu';

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
import EmployeeRestaurant from './pages/employee/EmployeeRestaurant';
import EmployeeKitchen from './pages/employee/EmployeeKitchen';

// Restaurant / Café module (shared components)
import RestaurantPos from './pages/restaurant/RestaurantPos';
import RestaurantKds from './pages/restaurant/RestaurantKds';
import RestaurantMenu from './pages/restaurant/RestaurantMenu';
import RestaurantTables from './pages/restaurant/RestaurantTables';
import RestaurantInventory from './pages/restaurant/RestaurantInventory';
import RestaurantReports from './pages/restaurant/RestaurantReports';

// Internal market (B2B between subscribers)
import MarketMyListings from './pages/market/MarketMyListings';
import MarketBrowse from './pages/market/MarketBrowse';
import MarketOrders from './pages/market/MarketOrders';

// Manufacturing (job-shop)
import MfgMaterials from './pages/manufacturing/MfgMaterials';
import MfgWorkCenters from './pages/manufacturing/MfgWorkCenters';
import MfgProducts from './pages/manufacturing/MfgProducts';
import MfgWorkOrders from './pages/manufacturing/MfgWorkOrders';
import MfgMolds from './pages/manufacturing/MfgMolds';
import CutListCalc from './pages/manufacturing/CutListCalc';
import WeightCalc from './pages/manufacturing/WeightCalc';

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
import AdminCustomers from './pages/admin/AdminCustomers';
import AdminPriceLists from './pages/admin/AdminPriceLists';
import AdminAnalytics from './pages/admin/AdminAnalytics';
import RequireAdmin from './pages/admin/RequireAdmin';
import RequireCapability from './pages/admin/RequireCapability';
import ManagerEmployees from './pages/admin/team/ManagerEmployees';
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
      {/* الجذر = بوابة دخول المشترك مباشرة (إيميل + كلمة مرور) */}
      <Route path="/" element={<Navigate to="/admin/login" replace />} />

      {/* Public storefront (no auth) */}
      <Route path="/store/:slug" element={<Storefront />} />

      {/* Public QR self-ordering (no auth) */}
      <Route path="/r/:tenantId/:tableId" element={<QrOrder />} />

      {/* Public restaurant online ordering (takeaway/delivery) */}
      <Route path="/menu/:tenantId" element={<RestaurantOnlineMenu />} />

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
        <Route path="restaurant" element={<EmployeeRestaurant />} />
        <Route path="kitchen" element={<EmployeeKitchen />} />
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
        <Route path="analytics" element={<RequireAdmin><AdminAnalytics /></RequireAdmin>} />

        {/* Online store — owner or delegated store manager */}
        <Route path="store/settings" element={<RequireCapability caps={['can_manage_store']}><AdminStoreSettings /></RequireCapability>} />
        <Route path="store/products" element={<RequireCapability caps={['can_manage_store']}><AdminStoreProducts /></RequireCapability>} />
        <Route path="store/orders" element={<RequireCapability caps={['can_manage_store']}><AdminStoreOrders /></RequireCapability>} />

        {/* Customers credit ledger (آجل) — owner or delegated store manager */}
        <Route path="customers" element={<RequireCapability caps={['can_manage_store']}><AdminCustomers /></RequireCapability>} />

        {/* Team — owner or delegated employee manager (manager-only page) */}
        <Route path="team" element={<RequireCapability caps={['can_manage_employees']}><ManagerEmployees /></RequireCapability>} />

        {/* Restaurant / Café — owner or delegated restaurant manager */}
        <Route path="restaurant/pos" element={<RequireCapability caps={['can_manage_restaurant']}><RestaurantPos token={null} /></RequireCapability>} />
        <Route path="restaurant/kds" element={<RequireCapability caps={['can_manage_restaurant']}><RestaurantKds token={null} /></RequireCapability>} />
        <Route path="restaurant/menu" element={<RequireCapability caps={['can_manage_restaurant']}><RestaurantMenu /></RequireCapability>} />
        <Route path="restaurant/tables" element={<RequireCapability caps={['can_manage_restaurant']}><RestaurantTables /></RequireCapability>} />
        <Route path="restaurant/inventory" element={<RequireCapability caps={['can_manage_restaurant']}><RestaurantInventory /></RequireCapability>} />
        <Route path="restaurant/reports" element={<RequireCapability caps={['can_manage_restaurant']}><RestaurantReports /></RequireCapability>} />

        {/* Internal market — owner or delegated market manager */}
        <Route path="market/listings" element={<RequireCapability caps={['can_manage_market']}><MarketMyListings /></RequireCapability>} />
        <Route path="market/browse" element={<RequireCapability caps={['can_manage_market']}><MarketBrowse /></RequireCapability>} />
        <Route path="market/orders" element={<RequireCapability caps={['can_manage_market']}><MarketOrders /></RequireCapability>} />

        {/* Manufacturing — owner or delegated manufacturing manager */}
        <Route path="mfg/work-orders" element={<RequireCapability caps={['can_manage_manufacturing']}><MfgWorkOrders /></RequireCapability>} />
        <Route path="mfg/products" element={<RequireCapability caps={['can_manage_manufacturing']}><MfgProducts /></RequireCapability>} />
        <Route path="mfg/materials" element={<RequireCapability caps={['can_manage_manufacturing']}><MfgMaterials /></RequireCapability>} />
        <Route path="mfg/work-centers" element={<RequireCapability caps={['can_manage_manufacturing']}><MfgWorkCenters /></RequireCapability>} />
        <Route path="mfg/molds" element={<RequireCapability caps={['can_manage_manufacturing']}><MfgMolds /></RequireCapability>} />
        <Route path="mfg/cutlist" element={<RequireCapability caps={['can_manage_manufacturing']}><CutListCalc /></RequireCapability>} />
        <Route path="mfg/weight" element={<RequireCapability caps={['can_manage_manufacturing']}><WeightCalc /></RequireCapability>} />

        {/* Operations — owner or inventory_manager per permissions */}
        <Route path="requests" element={<RequireCapability caps={['can_approve_requests']}><AdminRequests /></RequireCapability>} />
        <Route path="wholesale" element={<RequireCapability caps={['can_issue_wholesale']}><AdminWholesale /></RequireCapability>} />
        <Route path="price-lists" element={<RequireCapability caps={['can_manage_store']}><AdminPriceLists /></RequireCapability>} />
        <Route path="inventory" element={<AdminInventory />} />
        <Route path="receive-stock" element={<RequireCapability caps={['can_add_stock']}><AdminReceiveStock /></RequireCapability>} />

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
