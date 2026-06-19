import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { Spinner } from '../../components/ui';
import type { Permissions } from '../../lib/types';

interface NavItem {
  to: string;
  label: string;
  /** which roles see it; if undefined => admin only */
  show: (role: string, perms: Permissions | null) => boolean;
}

const adminOnly = (role: string) => role === 'admin';

const navItems: NavItem[] = [
  { to: '/admin/dashboard', label: 'لوحة التحكم', show: adminOnly },
  { to: '/admin/products', label: 'المنتجات', show: adminOnly },
  { to: '/admin/catalog', label: 'الكتالوج', show: adminOnly },
  { to: '/admin/branches', label: 'المعارض', show: adminOnly },
  { to: '/admin/employees', label: 'الموظفون', show: adminOnly },
  { to: '/admin/finance', label: 'المالية', show: adminOnly },
  {
    to: '/admin/inventory',
    label: 'المخزون',
    show: (role) => role === 'admin' || role === 'inventory_manager',
  },
  {
    to: '/admin/receive-stock',
    label: 'استلام بضاعة',
    show: (role, p) =>
      role === 'admin' || (role === 'inventory_manager' && !!p?.can_add_stock),
  },
  {
    to: '/admin/requests',
    label: 'طلبات البضاعة',
    show: (role, p) =>
      role === 'admin' ||
      (role === 'inventory_manager' && !!p?.can_approve_requests),
  },
  {
    to: '/admin/wholesale',
    label: 'الجملة',
    show: (role, p) =>
      role === 'admin' ||
      (role === 'inventory_manager' && !!p?.can_issue_wholesale),
  },
];

export default function AdminLayout() {
  const { loading, authed, profile, signOut } = useAdminAuth();
  const navigate = useNavigate();

  if (loading) return <Spinner label="جارٍ التحقق..." />;

  if (!authed || !profile) {
    navigate('/admin/login');
    return null;
  }

  const role = profile.role;
  const roleLabel = role === 'admin' ? 'أدمن' : 'مدير مخزون';
  const visible = navItems.filter((n) => n.show(role, profile.permissions));

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-indigo-600">
              {profile.full_name}
            </span>
            <span className="badge bg-indigo-100 text-indigo-700">
              {roleLabel}
            </span>
            {profile.status && profile.status !== 'active' && (
              <span className="badge bg-amber-100 text-amber-700">
                {profile.status}
              </span>
            )}
          </div>
          <button
            className="btn-ghost"
            onClick={async () => {
              await signOut();
              navigate('/');
            }}
          >
            خروج
          </button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {visible.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {role === 'inventory_manager' && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
            وضع مدير المخزون: التكلفة والأرباح مخفية تمامًا.
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
