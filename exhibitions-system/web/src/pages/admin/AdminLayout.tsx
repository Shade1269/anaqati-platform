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
  Settings,
  ShoppingBag,
  ClipboardList as ClipboardListIcon,
  Armchair,
  ChefHat,
  UtensilsCrossed,
  LayoutGrid,
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
}

const sz = 18;

/* ---- Inventory flag helper (manager can read inventory if any op flag set) ---- */
function hasAnyInventoryFlag(p: Permissions | null): boolean {
  return !!(
    p?.can_add_stock ||
    p?.can_approve_requests ||
    p?.can_issue_transfers ||
    p?.can_transfers ||
    p?.can_issue_wholesale ||
    p?.can_receive_returns ||
    p?.can_returns
  );
}

/* ---- Reusable nav items ---- */
const navInventory: Item = { to: '/admin/inventory', label: 'المخزون', icon: <Boxes size={sz} /> };
const navReceive: Item = { to: '/admin/receive-stock', label: 'استلام بضاعة', icon: <PackagePlus size={sz} /> };
const navRequests: Item = { to: '/admin/requests', label: 'طلبات البضاعة', icon: <ClipboardList size={sz} /> };
const navWholesale: Item = { to: '/admin/wholesale', label: 'الجملة', icon: <ShoppingCart size={sz} /> };

const navStoreSettings: Item = { to: '/admin/store/settings', label: 'إعدادات المتجر', icon: <Settings size={sz} /> };
const navStoreProducts: Item = { to: '/admin/store/products', label: 'منتجات المتجر', icon: <ShoppingBag size={sz} /> };
const navStoreOrders: Item = { to: '/admin/store/orders', label: 'طلبات المتجر', icon: <ClipboardListIcon size={sz} /> };

const navTeam: Item = { to: '/admin/team', label: 'الموظفون', icon: <Users size={sz} /> };

/* ---- Restaurant nav items ---- */
const navRestPos: Item = { to: '/admin/restaurant/pos', label: 'الطاولات (نقطة البيع)', icon: <LayoutGrid size={sz} /> };
const navRestKds: Item = { to: '/admin/restaurant/kds', label: 'شاشة المطبخ', icon: <ChefHat size={sz} /> };
const navRestMenu: Item = { to: '/admin/restaurant/menu', label: 'المنيو', icon: <UtensilsCrossed size={sz} /> };
const navRestTables: Item = { to: '/admin/restaurant/tables', label: 'إدارة الطاولات', icon: <Armchair size={sz} /> };
const restaurantItems: Item[] = [navRestPos, navRestKds, navRestMenu, navRestTables];

/* ---- OWNER nav (restaurant): POS + kitchen + menu, no retail/store ops ---- */
function ownerRestaurantSections(): NavSection[] {
  return [
    {
      title: 'نظرة عامة',
      items: [{ to: '/admin/dashboard', label: 'لوحة التحكم', icon: <LayoutDashboard size={sz} /> }],
    },
    { title: 'المطعم', items: restaurantItems },
    {
      title: 'المالية والمحاسبة',
      items: [
        { to: '/admin/finance', label: 'المالية', icon: <Wallet size={sz} /> },
        { to: '/admin/accounting', label: 'النظرة المالية', icon: <Calculator size={sz} />, end: true },
        { to: '/admin/accounting/income', label: 'قائمة الدخل', icon: <TrendingUp size={sz} /> },
        { to: '/admin/accounting/balance', label: 'الميزانية العمومية', icon: <Scale size={sz} /> },
        { to: '/admin/accounting/trial-balance', label: 'ميزان المراجعة', icon: <ListChecks size={sz} /> },
        { to: '/admin/accounting/ledger', label: 'دفتر الأستاذ', icon: <BookOpen size={sz} /> },
        { to: '/admin/accounting/journal', label: 'القيود اليومية', icon: <NotebookPen size={sz} /> },
        { to: '/admin/accounting/cashflow', label: 'قائمة التدفق النقدي', icon: <Waves size={sz} /> },
      ],
    },
    {
      title: 'النظام',
      items: [
        { to: '/admin/employees', label: 'الموظفون', icon: <Users size={sz} /> },
        { to: '/admin/branding', label: 'العلامة التجارية', icon: <Palette size={sz} /> },
        { to: '/admin/audit', label: 'سجل العمليات', icon: <ScrollText size={sz} /> },
      ],
    },
  ];
}

/* ---- OWNER nav: grouped & tidy ---- */
function ownerSections(): NavSection[] {
  return [
    {
      title: 'نظرة عامة',
      items: [
        { to: '/admin/dashboard', label: 'لوحة التحكم', icon: <LayoutDashboard size={sz} /> },
        { to: '/admin/monitoring', label: 'مراقبة الموظفين', icon: <UserCheck size={sz} /> },
      ],
    },
    {
      title: 'التشغيل',
      items: [
        { to: '/admin/products', label: 'المنتجات', icon: <Package size={sz} /> },
        { to: '/admin/catalog', label: 'الكتالوج', icon: <Tags size={sz} /> },
        { to: '/admin/branches', label: 'المعارض', icon: <Store size={sz} /> },
        navRequests,
        navReceive,
        navInventory,
        navWholesale,
      ],
    },
    {
      title: 'المتجر الإلكتروني',
      items: [navStoreSettings, navStoreProducts, navStoreOrders],
    },
    {
      title: 'المالية والمحاسبة',
      items: [
        { to: '/admin/finance', label: 'المالية', icon: <Wallet size={sz} /> },
        { to: '/admin/accounting', label: 'النظرة المالية', icon: <Calculator size={sz} />, end: true },
        { to: '/admin/accounting/income', label: 'قائمة الدخل', icon: <TrendingUp size={sz} /> },
        { to: '/admin/accounting/balance', label: 'الميزانية العمومية', icon: <Scale size={sz} /> },
        { to: '/admin/accounting/trial-balance', label: 'ميزان المراجعة', icon: <ListChecks size={sz} /> },
        { to: '/admin/accounting/ledger', label: 'دفتر الأستاذ', icon: <BookOpen size={sz} /> },
        { to: '/admin/accounting/journal', label: 'القيود اليومية', icon: <NotebookPen size={sz} /> },
        { to: '/admin/accounting/cashflow', label: 'قائمة التدفق النقدي', icon: <Waves size={sz} /> },
        { to: '/admin/suppliers', label: 'الموردون', icon: <Truck size={sz} /> },
      ],
    },
    {
      title: 'النظام',
      items: [
        { to: '/admin/employees', label: 'الموظفون', icon: <Users size={sz} /> },
        { to: '/admin/branding', label: 'العلامة التجارية', icon: <Palette size={sz} /> },
        { to: '/admin/audit', label: 'سجل العمليات', icon: <ScrollText size={sz} /> },
      ],
    },
  ];
}

/* ---- MANAGER nav: only what permission flags allow ---- */
function managerSections(p: Permissions | null): NavSection[] {
  const sections: NavSection[] = [];

  const ops: Item[] = [];
  if (hasAnyInventoryFlag(p)) ops.push(navInventory);
  if (p?.can_add_stock) ops.push(navReceive);
  if (p?.can_approve_requests) ops.push(navRequests);
  if (p?.can_issue_wholesale) ops.push(navWholesale);
  if (ops.length) sections.push({ title: 'العمليات', items: ops });

  if (p?.can_manage_store) {
    sections.push({
      title: 'المتجر الإلكتروني',
      items: [navStoreSettings, navStoreProducts, navStoreOrders],
    });
  }

  if (p?.can_manage_restaurant) {
    sections.push({ title: 'المطعم', items: restaurantItems });
  }

  if (p?.can_manage_employees) {
    sections.push({ title: 'الفريق', items: [navTeam] });
  }

  return sections;
}

/* ---- A manager with broad caps is labelled "مدير", else "مدير مخزون" ---- */
function managerHasBroadCaps(p: Permissions | null): boolean {
  return !!(p?.can_manage_employees || p?.can_manage_store);
}

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
  const isOwner = role === 'admin';
  const isRestaurant = profile.tenant?.business_type === 'restaurant';
  const sections: NavSection[] = isOwner
    ? isRestaurant
      ? ownerRestaurantSections()
      : ownerSections()
    : managerSections(perms);

  const managerLabel = managerHasBroadCaps(perms) ? 'مدير' : 'مدير مخزون';

  const unread = notifs.filter((n) => !n.is_read).length;
  const brand = profile.tenant?.brand_name || profile.tenant?.name || 'Black Axis';
  const logoUrl = profile.tenant?.logo_url || null;

  return (
    <>
      <DashboardShell
        brand={brand}
        brandSub={isOwner ? 'لوحة المالك' : 'لوحة المدير'}
        logoUrl={logoUrl}
        sections={sections}
        userName={profile.full_name}
        roleLabel={isOwner ? 'مالك' : managerLabel}
        roleTone={isOwner ? 'gold' : 'info'}
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
          !isOwner ? (
            <div className="mb-5 rounded-lg border border-info/30 bg-info/8 px-4 py-2.5 text-xs font-medium text-info">
              وضع المدير: لا تظهر التكلفة ولا الأرباح.
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
