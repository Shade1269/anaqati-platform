import { useCallback, useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Tags,
  Store,
  Users,
  ClipboardList,
  ShoppingCart,
  Boxes,
  PackagePlus,
  Wallet,
  ScrollText,
  ShieldAlert,
  Calculator,
  TrendingUp,
  Scale,
  ListChecks,
  BookOpen,
  NotebookPen,
  UserCheck,
  Truck,
  Waves,
  Palette,
} from 'lucide-react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import type { NotificationRow, Permissions } from '../../lib/types';
import { Spinner, Dialog, Button } from '../../components/ui';
import {
  DashboardShell,
  type NavSection,
} from '../../components/shell/DashboardShell';
import { NotificationsPanel } from '../../components/shell/NotificationsPanel';

interface Item {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
  show: (role: string, p: Permissions | null) => boolean;
}

const adminOnly = (role: string) => role === 'admin';
const sz = 18;

const operations: Item[] = [
  {
    to: '/admin/inventory',
    label: 'المخزون',
    icon: <Boxes size={sz} />,
    show: (r) => r === 'admin' || r === 'inventory_manager',
  },
  {
    to: '/admin/receive-stock',
    label: 'استلام بضاعة',
    icon: <PackagePlus size={sz} />,
    show: (r, p) => r === 'admin' || (r === 'inventory_manager' && !!p?.can_add_stock),
  },
  {
    to: '/admin/requests',
    label: 'طلبات البضاعة',
    icon: <ClipboardList size={sz} />,
    show: (r, p) =>
      r === 'admin' || (r === 'inventory_manager' && !!p?.can_approve_requests),
  },
  {
    to: '/admin/wholesale',
    label: 'الجملة',
    icon: <ShoppingCart size={sz} />,
    show: (r, p) =>
      r === 'admin' || (r === 'inventory_manager' && !!p?.can_issue_wholesale),
  },
];

const management: Item[] = [
  { to: '/admin/dashboard', label: 'لوحة التحكم', icon: <LayoutDashboard size={sz} />, show: adminOnly },
  { to: '/admin/products', label: 'المنتجات', icon: <Package size={sz} />, show: adminOnly },
  { to: '/admin/catalog', label: 'الكتالوج', icon: <Tags size={sz} />, show: adminOnly },
  { to: '/admin/branches', label: 'المعارض', icon: <Store size={sz} />, show: adminOnly },
  { to: '/admin/employees', label: 'الموظفون', icon: <Users size={sz} />, show: adminOnly },
  { to: '/admin/monitoring', label: 'مراقبة الموظفين', icon: <UserCheck size={sz} />, show: adminOnly },
  { to: '/admin/suppliers', label: 'الموردون', icon: <Truck size={sz} />, show: adminOnly },
  { to: '/admin/finance', label: 'المالية', icon: <Wallet size={sz} />, show: adminOnly },
  { to: '/admin/audit', label: 'سجل العمليات', icon: <ScrollText size={sz} />, show: adminOnly },
  { to: '/admin/branding', label: 'العلامة التجارية', icon: <Palette size={sz} />, show: adminOnly },
];

const accounting: Item[] = [
  { to: '/admin/accounting', label: 'النظرة المالية', icon: <Calculator size={sz} />, end: true, show: adminOnly },
  { to: '/admin/accounting/income', label: 'قائمة الدخل', icon: <TrendingUp size={sz} />, show: adminOnly },
  { to: '/admin/accounting/balance', label: 'الميزانية العمومية', icon: <Scale size={sz} />, show: adminOnly },
  { to: '/admin/accounting/trial-balance', label: 'ميزان المراجعة', icon: <ListChecks size={sz} />, show: adminOnly },
  { to: '/admin/accounting/ledger', label: 'دفتر الأستاذ', icon: <BookOpen size={sz} />, show: adminOnly },
  { to: '/admin/accounting/journal', label: 'القيود اليومية', icon: <NotebookPen size={sz} />, show: adminOnly },
  { to: '/admin/accounting/cashflow', label: 'قائمة التدفق النقدي', icon: <Waves size={sz} />, show: adminOnly },
];

export default function AdminLayout() {
  const { loading, authed, profile, signOut } = useAdminAuth();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotificationRow[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);

  const loadNotifs = useCallback(async () => {
    setNotifLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('id,title,body,is_read,created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    setNotifs((data as NotificationRow[]) || []);
    setNotifLoading(false);
  }, []);

  useEffect(() => {
    if (authed && profile) loadNotifs();
  }, [authed, profile, loadNotifs]);

  async function markRead(id: string) {
    try {
      await adminApi.markNotificationRead(id);
    } catch {
      /* ignore */
    }
    setNotifs((s) => s.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  }

  if (loading) return <Spinner label="جارٍ التحقق..." />;

  if (!authed || !profile) {
    navigate('/admin/login');
    return null;
  }

  const role = profile.role;

  if (role !== 'admin' && role !== 'inventory_manager') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/15 text-danger">
          <ShieldAlert size={28} />
        </div>
        <h1 className="text-xl font-bold text-text">لا تملك صلاحية الوصول</h1>
        <p className="max-w-sm text-sm text-muted">
          حسابك غير مُصرَّح له بالدخول إلى لوحة الإدارة. تواصل مع المسؤول.
        </p>
        <Button
          variant="ghost"
          onClick={async () => {
            await signOut();
            navigate('/');
          }}
        >
          خروج
        </Button>
      </div>
    );
  }

  const perms = profile.permissions;
  const sections: NavSection[] = [];
  const mgmt = management.filter((i) => i.show(role, perms));
  const ops = operations.filter((i) => i.show(role, perms));
  const acct = accounting.filter((i) => i.show(role, perms));
  if (mgmt.length) sections.push({ title: 'الإدارة', items: mgmt });
  if (ops.length) sections.push({ title: 'العمليات', items: ops });
  if (acct.length) sections.push({ title: 'المحاسبة', items: acct });

  const unread = notifs.filter((n) => !n.is_read).length;
  const brand = profile.tenant?.brand_name || profile.tenant?.name || 'Black Axis';
  const logoUrl = profile.tenant?.logo_url || null;

  return (
    <>
      <DashboardShell
        brand={brand}
        brandSub={role === 'admin' ? 'لوحة الأدمن' : 'إدارة المخزون'}
        logoUrl={logoUrl}
        sections={sections}
        userName={profile.full_name}
        roleLabel={role === 'admin' ? 'أدمن' : 'مدير مخزون'}
        roleTone={role === 'admin' ? 'gold' : 'info'}
        onLogout={async () => {
          await signOut();
          navigate('/');
        }}
        notifications={{
          unread,
          onClick: () => {
            setNotifOpen(true);
            loadNotifs();
          },
        }}
        banner={
          role === 'inventory_manager' ? (
            <div className="mb-5 rounded-lg border border-info/30 bg-info/8 px-4 py-2.5 text-xs font-medium text-info">
              وضع مدير المخزون: التكلفة والأرباح مخفية تمامًا.
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
