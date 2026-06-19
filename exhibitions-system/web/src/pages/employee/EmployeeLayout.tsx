import { useEffect, useState } from 'react';
import {
  NavLink,
  Outlet,
  useNavigate,
} from 'react-router-dom';
import { useEmployeeAuth } from '../../context/EmployeeAuthContext';
import { employeeApi } from '../../lib/api';
import type { Branch } from '../../lib/types';
import { getStoredBranchId } from '../../context/useBranchSelection';

const links = [
  { to: '/employee/dashboard', label: 'لوحة التحكم' },
  { to: '/employee/pos', label: 'نقطة البيع' },
  { to: '/employee/request-stock', label: 'طلب بضاعة' },
  { to: '/employee/withdraw', label: 'سحب عُهدة' },
  { to: '/employee/settlement', label: 'تسليم العُهدة' },
];

export default function EmployeeLayout() {
  const { session, signOut } = useEmployeeAuth();
  const navigate = useNavigate();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string | null>(getStoredBranchId());

  useEffect(() => {
    if (!session) {
      navigate('/employee/login');
      return;
    }
    employeeApi
      .listBranches(session.token)
      .then((bs) => {
        setBranches(bs);
        if (!getStoredBranchId() && bs.length > 0) {
          chooseBranch(bs[0].id);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  function chooseBranch(id: string) {
    localStorage.setItem('employee_branch_id', id);
    setBranchId(id);
    // force dependent pages to re-read via a navigation refresh signal
    window.dispatchEvent(new Event('branch-changed'));
  }

  if (!session) return null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-emerald-600">
              {session.full_name}
            </span>
            <span className="badge bg-emerald-100 text-emerald-700">موظف</span>
          </div>
          <div className="flex items-center gap-3">
            <select
              className="input w-auto"
              value={branchId ?? ''}
              onChange={(e) => chooseBranch(e.target.value)}
            >
              <option value="" disabled>
                اختر المعرض
              </option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button
              className="btn-ghost"
              onClick={() => {
                signOut();
                navigate('/');
              }}
            >
              خروج
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive
                    ? 'bg-emerald-600 text-white'
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
        {!branchId && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            اختر المعرض من الأعلى للبدء.
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
