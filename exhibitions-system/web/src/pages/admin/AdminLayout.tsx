import { useCallback, useEffect, useState } from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Tags,
  Store,
  Users,
  ClipboardList,
  ClipboardCheck,
  ScanLine,
  Upload,
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
  Component,
  Scissors,
  Users2,
  FileText,
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
const navPurchaseOrders: Item = { to: '/admin/purchase-orders', label: 'أوامر الشراء', icon: <ClipboardList size={sz} /> };
const navStockCount: Item = { to: '/admin/stock-count', label: 'الجرد الدوري', icon: <ClipboardCheck size={sz} /> };
const navCashier: Item = { to: '/admin/cashier', label: 'الكاشير', icon: <ScanLine size={sz} /> };
const navImport: Item = { to: '/admin/import', label: 'استيراد البيانات', icon: <Upload size={sz} /> };
const navDelivery: Item = { to: '/admin/delivery', label: 'التوزيع والمندوبون', icon: <Truck size={sz} /> };
const navRequests: Item = { to: '/admin/requests', label: 'طلبات البضاعة', icon: <ClipboardList size={sz} /> };
const navWholesale: Item = { to: '/admin/wholesale', label: 'الجملة', icon: <ShoppingCart size={sz} /> };
const navPriceLists: Item = { to: '/admin/price-lists', label: 'قوائم الأسعار', icon: <Tags size={sz} /> };

const navStoreSettings: Item = { to: '/admin/store/settings', label: 'إعدادات المتجر', icon: <Settings size={sz} /> };
const navStoreProducts: Item = { to: '/admin/store/products', label: 'منتجات المتجر', icon: <ShoppingBag size={sz} /> };
const navStoreOrders: Item = { to: '/admin/store/orders', label: 'طلبات المتجر', icon: <ClipboardListIcon size={sz} /> };

const navTeam: Item = { to: '/admin/team', label: 'الموظفون', icon: <Users size={sz} /> };

const navCustomers: Item = { to: '/admin/customers', label: 'العملاء (الدين)', icon: <UserCheck size={sz} /> };

/* ---- CRM + عروض الأسعار (مشترك لكل الأنشطة) ---- */
const navCrm: Item = { to: '/admin/crm', label: 'العملاء المحتملون', icon: <Users2 size={sz} /> };
const navQuotations: Item = { to: '/admin/quotations', label: 'عروض الأسعار', icon: <FileText size={sz} /> };
const crmSection: NavSection = { title: 'المبيعات ومتابعة العملاء', items: [navCrm, navQuotations] };

/* ---- Restaurant nav items ---- */
const navRestPos: Item = { to: '/admin/restaurant/pos', label: 'الطاولات (نقطة البيع)', icon: <LayoutGrid size={sz} /> };
const navRestKds: Item = { to: '/admin/restaurant/kds', label: 'شاشة المطبخ', icon: <ChefHat size={sz} /> };
const navRestMenu: Item = { to: '/admin/restaurant/menu', label: 'المنيو', icon: <UtensilsCrossed size={sz} /> };
const navRestTables: Item = { to: '/admin/restaurant/tables', label: 'إدارة الطاولات', icon: <Armchair size={sz} /> };
const navRestInventory: Item = { to: '/admin/restaurant/inventory', label: 'مخزون المواد', icon: <Boxes size={sz} /> };
const navRestReports: Item = { to: '/admin/restaurant/reports', label: 'تحليلات المطعم', icon: <TrendingUp size={sz} /> };
const restaurantItems: Item[] = [navRestPos, navRestKds, navRestMenu, navRestTables, navRestInventory, navRestReports];

/* ---- Internal market (B2B) — shared by all subscribers ---- */
const navMarketBrowse: Item = { to: '/admin/market/browse', label: 'تصفّح السوق', icon: <ShoppingBag size={sz} /> };
const navMarketListings: Item = { to: '/admin/market/listings', label: 'منتجاتي في السوق', icon: <Store size={sz} /> };
const navMarketOrders: Item = { to: '/admin/market/orders', label: 'طلبات السوق', icon: <ClipboardListIcon size={sz} /> };
const marketSection = { title: 'السوق الداخلي', items: [navMarketBrowse, navMarketListings, navMarketOrders] };

/* ---- Manufacturing (job-shop) ---- */
const navMfgWO: Item = { to: '/admin/mfg/work-orders', label: 'أوامر الشغل', icon: <ClipboardList size={sz} /> };
const navMfgProducts: Item = { to: '/admin/mfg/products', label: 'المنتجات والوصفات', icon: <Package size={sz} /> };
const navMfgMaterials: Item = { to: '/admin/mfg/materials', label: 'مواد التصنيع', icon: <Boxes size={sz} /> };
const navMfgWC: Item = { to: '/admin/mfg/work-centers', label: 'محطات العمل', icon: <Settings size={sz} /> };
const navMfgMolds: Item = { to: '/admin/mfg/molds', label: 'القوالب', icon: <Component size={sz} /> };
const navMfgCutlist: Item = { to: '/admin/mfg/cutlist', label: 'حاسبة القص', icon: <Scissors size={sz} /> };
const navMfgWeight: Item = { to: '/admin/mfg/weight', label: 'حاسبة الوزن', icon: <Scale size={sz} /> };
const baseMfgItems: Item[] = [navMfgWO, navMfgProducts, navMfgMaterials, navMfgWC];

/** أدوات القطاع الفرعي تُضاف لقائمة التصنيع */
function mfgItemsFor(subtype?: string): Item[] {
  if (subtype === 'plastics') return [...baseMfgItems, navMfgMolds];
  if (subtype === 'wood') return [...baseMfgItems, navMfgCutlist];
  if (subtype === 'metal') return [...baseMfgItems, navMfgWeight];
  return baseMfgItems;
}

/* ---- أقسام مشتركة لكل الأنشطة ---- */
const overviewSection: NavSection = {
  title: 'نظرة عامة',
  items: [
    { to: '/admin/dashboard', label: 'لوحة التحكم', icon: <LayoutDashboard size={sz} /> },
    { to: '/admin/monitoring', label: 'مراقبة الموظفين', icon: <UserCheck size={sz} /> },
  ],
};
const financeSection: NavSection = {
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
    { to: '/admin/accounting/profitability', label: 'تقارير الربحية', icon: <TrendingUp size={sz} /> },
    navCustomers,
    { to: '/admin/suppliers', label: 'الموردون', icon: <Truck size={sz} /> },
  ],
};
const systemSection: NavSection = {
  title: 'النظام',
  items: [
    { to: '/admin/employees', label: 'الموظفون', icon: <Users size={sz} /> },
    { to: '/admin/branding', label: 'العلامة التجارية', icon: <Palette size={sz} /> },
    { to: '/admin/audit', label: 'سجل العمليات', icon: <ScrollText size={sz} /> },
  ],
};

/* ---- OWNER nav: كل نشاط يرى وحدته + المشترك فقط (بلا خلط بين الأنشطة) ---- */
function ownerSections(bizType?: string, bizSubtype?: string): NavSection[] {
  if (bizType === 'restaurant') {
    return [overviewSection, { title: 'المطعم', items: restaurantItems }, marketSection, crmSection, financeSection, systemSection];
  }
  if (bizType === 'manufacturing') {
    return [overviewSection, { title: 'التصنيع', items: mfgItemsFor(bizSubtype) }, marketSection, crmSection, financeSection, systemSection];
  }
  if (bizType === 'distribution') {
    // مورّد مواد غذائية: كتالوج + مخزون + بيع جملة بالآجل + سوق B2B + محاسبة
    return [
      {
        title: 'نظرة عامة',
        items: [
          { to: '/admin/dashboard', label: 'لوحة التحكم', icon: <LayoutDashboard size={sz} /> },
          { to: '/admin/analytics', label: 'التحليلات', icon: <TrendingUp size={sz} /> },
          { to: '/admin/monitoring', label: 'مراقبة الموظفين', icon: <UserCheck size={sz} /> },
        ],
      },
      {
        title: 'الكتالوج والمخزون',
        items: [
          { to: '/admin/products', label: 'المنتجات', icon: <Package size={sz} /> },
          { to: '/admin/catalog', label: 'التصنيفات', icon: <Tags size={sz} /> },
          navInventory,
          navPurchaseOrders,
          navReceive,
          navStockCount,
          navImport,
        ],
      },
      {
        title: 'المبيعات (جملة)',
        items: [
          navWholesale,
          navDelivery,
          navPriceLists,
          navCustomers,
        ],
      },
      marketSection,
      crmSection,
      financeSection,
      systemSection,
    ];
  }
  if (bizType === 'grocery') {
    // بقالة / سوبر ماركت: الكاشير في المقدّمة + كتالوج ومخزون + متجر + مالية
    return [
      {
        title: 'نظرة عامة',
        items: [
          { to: '/admin/dashboard', label: 'لوحة التحكم', icon: <LayoutDashboard size={sz} /> },
          { to: '/admin/analytics', label: 'التحليلات', icon: <TrendingUp size={sz} /> },
          { to: '/admin/monitoring', label: 'مراقبة الموظفين', icon: <UserCheck size={sz} /> },
        ],
      },
      { title: 'البيع', items: [navCashier] },
      {
        title: 'الكتالوج والمخزون',
        items: [
          { to: '/admin/products', label: 'المنتجات', icon: <Package size={sz} /> },
          { to: '/admin/catalog', label: 'الفئات', icon: <Tags size={sz} /> },
          { to: '/admin/branches', label: 'المتجر/الفروع', icon: <Store size={sz} /> },
          navPurchaseOrders,
          navReceive,
          navInventory,
          navStockCount,
          navImport,
        ],
      },
      { title: 'المتجر الإلكتروني', items: [navStoreSettings, navStoreProducts, navStoreOrders] },
      { title: 'العملاء', items: [navCustomers, navPriceLists] },
      marketSection,
      crmSection,
      financeSection,
      systemSection,
    ];
  }
  // التجزئة (الافتراضي)
  return [
    {
      title: 'نظرة عامة',
      items: [
        { to: '/admin/dashboard', label: 'لوحة التحكم', icon: <LayoutDashboard size={sz} /> },
        { to: '/admin/analytics', label: 'التحليلات', icon: <TrendingUp size={sz} /> },
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
        navPurchaseOrders,
        navReceive,
        navInventory,
        navStockCount,
        navImport,
        navWholesale,
        navPriceLists,
      ],
    },
    { title: 'المتجر الإلكتروني', items: [navStoreSettings, navStoreProducts, navStoreOrders] },
    marketSection,
    financeSection,
    systemSection,
  ];
}

/* ---- MANAGER nav: only what permission flags allow ---- */
function managerSections(p: Permissions | null, subtype?: string): NavSection[] {
  const sections: NavSection[] = [];

  const ops: Item[] = [];
  if (hasAnyInventoryFlag(p)) ops.push(navInventory);
  if (p?.can_add_stock) ops.push(navPurchaseOrders);
  if (p?.can_add_stock) ops.push(navReceive);
  if (p?.can_add_stock) ops.push(navStockCount);
  if (p?.can_add_stock) ops.push(navImport);
  if (p?.can_approve_requests) ops.push(navRequests);
  if (p?.can_issue_wholesale) ops.push(navWholesale);
  if (p?.can_issue_wholesale) ops.push(navDelivery);
  if (ops.length) sections.push({ title: 'العمليات', items: ops });

  if (p?.can_manage_store) {
    sections.push({ title: 'البيع', items: [navCashier] });
    sections.push({
      title: 'المتجر الإلكتروني',
      items: [navStoreSettings, navStoreProducts, navStoreOrders],
    });
    sections.push({ title: 'العملاء والأسعار', items: [navCustomers, navPriceLists] });
    sections.push(crmSection);
  }

  if (p?.can_manage_restaurant) {
    sections.push({ title: 'المطعم', items: restaurantItems });
  }

  if (p?.can_manage_manufacturing) {
    sections.push({ title: 'التصنيع', items: mfgItemsFor(subtype) });
  }

  if (p?.can_manage_market) {
    sections.push(marketSection);
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

  if (!authed || !profile) return <Navigate to="/admin/login" replace />;

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
  const bizType = profile.tenant?.business_type;
  const bizSubtype = profile.tenant?.business_subtype;
  const sections: NavSection[] = isOwner
    ? ownerSections(bizType, bizSubtype)
    : managerSections(perms, bizSubtype);

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
