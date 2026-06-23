import { useCallback, useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingBag,
  PackagePlus,
  PackageMinus,
  Wallet,
  Bell,
  Undo2,
} from 'lucide-react';
import { useEmployeeAuth } from '../../context/EmployeeAuthContext';
import { employeeApi } from '../../lib/api';
import type { Branch, NotificationRow } from '../../lib/types';
import { getStoredBranchId } from '../../context/useBranchSelection';
import { Select, Dialog } from '../../components/ui';
import {
  DashboardShell,
  type NavSection,
} from '../../components/shell/DashboardShell';
import { NotificationsPanel } from '../../components/shell/NotificationsPanel';

const sz = 18;
const sections: NavSection[] = [
  {
    items: [
      { to: '/employee/dashboard', label: 'لوحة التحكم', icon: <LayoutDashboard size={sz} /> },
      { to: '/employee/pos', label: 'نقطة البيع', icon: <ShoppingBag size={sz} /> },
      { to: '/employee/returns', label: 'إرجاع المبيعات', icon: <Undo2 size={sz} /> },
      { to: '/employee/request-stock', label: 'طلب بضاعة', icon: <PackagePlus size={sz} /> },
      { to: '/employee/withdraw', label: 'سحب عُهدة', icon: <PackageMinus size={sz} /> },
      { to: '/employee/settlement', label: 'تسليم العُهدة', icon: <Wallet size={sz} /> },
      { to: '/employee/notifications', label: 'الإشعارات', icon: <Bell size={sz} /> },
    ],
  },
];

export default function EmployeeLayout() {
  const { session, signOut } = useEmployeeAuth();
  const navigate = useNavigate();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string | null>(getStoredBranchId());
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotificationRow[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);

  const loadNotifs = useCallback(async () => {
    if (!session) return;
    setNotifLoading(true);
    try {
      const data = await employeeApi.notifications(session.token);
      setNotifs(data || []);
    } catch {
      /* ignore */
    } finally {
      setNotifLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session) {
      navigate('/employee/login');
      return;
    }
    employeeApi
      .listBranches(session.token)
      .then((bs) => {
        setBranches(bs);
        if (!getStoredBranchId() && bs.length > 0) chooseBranch(bs[0].id);
      })
      .catch(() => {});
    loadNotifs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  function chooseBranch(id: string) {
    localStorage.setItem('employee_branch_id', id);
    setBranchId(id);
    window.dispatchEvent(new Event('branch-changed'));
  }

  async function markRead(id: string) {
    if (!session) return;
    try {
      await employeeApi.markRead(session.token, id);
    } catch {
      /* ignore */
    }
    setNotifs((s) => s.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  }

  if (!session) return null;

  const unread = notifs.filter((n) => !n.is_read).length;

  return (
    <>
      <DashboardShell
        brand="Black Axis"
        brandSub="تطبيق الموظف"
        sections={sections}
        userName={session.full_name}
        roleLabel="موظف"
        roleTone="success"
        onLogout={() => {
          signOut();
          navigate('/');
        }}
        notifications={{
          unread,
          onClick: () => {
            setNotifOpen(true);
            loadNotifs();
          },
        }}
        topExtra={
          <Select
            className="w-44"
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
          </Select>
        }
        banner={
          !branchId ? (
            <div className="mb-5 rounded-lg border border-warning/30 bg-warning/8 px-4 py-2.5 text-sm font-medium text-warning">
              اختر المعرض من الأعلى للبدء.
            </div>
          ) : undefined
        }
      >
        <Outlet />
      </DashboardShell>

      <Dialog
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        title="الإشعارات"
        size="md"
      >
        <NotificationsPanel
          loading={notifLoading}
          items={notifs}
          onMarkRead={markRead}
        />
      </Dialog>
    </>
  );
}
