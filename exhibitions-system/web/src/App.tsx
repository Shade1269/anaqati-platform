import { Navigate, Route, Routes } from 'react-router-dom';
import Landing from './pages/Landing';

// Employee
import EmployeeLogin from './pages/employee/EmployeeLogin';
import EmployeeLayout from './pages/employee/EmployeeLayout';
import EmployeeDashboard from './pages/employee/EmployeeDashboard';
import EmployeePos from './pages/employee/EmployeePos';
import EmployeeRequestStock from './pages/employee/EmployeeRequestStock';
import EmployeeWithdraw from './pages/employee/EmployeeWithdraw';
import EmployeeSettlement from './pages/employee/EmployeeSettlement';

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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />

      {/* Employee */}
      <Route path="/employee/login" element={<EmployeeLogin />} />
      <Route path="/employee" element={<EmployeeLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<EmployeeDashboard />} />
        <Route path="pos" element={<EmployeePos />} />
        <Route path="request-stock" element={<EmployeeRequestStock />} />
        <Route path="withdraw" element={<EmployeeWithdraw />} />
        <Route path="settlement" element={<EmployeeSettlement />} />
      </Route>

      {/* Admin / IM */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="catalog" element={<AdminCatalog />} />
        <Route path="branches" element={<AdminBranches />} />
        <Route path="employees" element={<AdminEmployees />} />
        <Route path="requests" element={<AdminRequests />} />
        <Route path="finance" element={<AdminFinance />} />
        <Route path="wholesale" element={<AdminWholesale />} />
        <Route path="inventory" element={<AdminInventory />} />
        <Route path="receive-stock" element={<AdminReceiveStock />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
