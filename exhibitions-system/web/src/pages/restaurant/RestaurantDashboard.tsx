import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Wallet,
  Receipt,
  TrendingUp,
  Armchair,
  LayoutGrid,
  BarChart3,
  Trophy,
  Banknote,
  CreditCard,
} from 'lucide-react';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { restaurantApi } from '../../lib/api';
import type { RestaurantReport, DiningTable, ShiftZ } from '../../lib/types';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { Button, EmptyState, ErrorBanner, PageHeader, Spinner, StatCard, Table } from '../../components/ui';
import { money } from '../../lib/format';

function today(): string {
  // تاريخ اليوم بتوقيت سوريا (UTC+3) ليطابق تجميع التقارير
  return new Date(Date.now() + 10800000).toISOString().slice(0, 10);
}

export default function RestaurantDashboard() {
  const { profile } = useAdminAuth();
  const tenantId = profile?.tenant_id || profile?.tenant?.id || '';
  const onlineUrl = `${window.location.origin}/menu/${tenantId}`;
  const [copied, setCopied] = useState(false);
  const [rep, setRep] = useState<RestaurantReport | null>(null);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [shift, setShift] = useState<ShiftZ | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const d = today();
        const [r, t, s] = await Promise.all([
          restaurantApi.report(d, d),
          restaurantApi.tables(null),
          restaurantApi.shiftCurrent(null).catch(() => null),
        ]);
        setRep(r);
        setTables(t);
        setShift(s);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Spinner />;

  const s = rep?.summary;
  const openTables = tables.filter((t) => t.sessions.length > 0).length;
  const freeTables = tables.filter((t) => t.sessions.length === 0).length;

  return (
    <div>
      <PageHeader
        title="لوحة التحكم"
        subtitle="نظرة عامة على مطعمك اليوم"
        icon={<LayoutDashboard size={22} />}
        action={
          <div className="flex gap-2">
            <Link to="/admin/restaurant/pos"><Button size="sm" icon={<LayoutGrid size={15} />}>الطاولات</Button></Link>
            <Link to="/admin/restaurant/reports"><Button size="sm" variant="outline" icon={<BarChart3 size={15} />}>التقارير</Button></Link>
          </div>
        }
      />
      <ErrorBanner message={error} />

      {/* رابط الطلب أونلاين */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/8 px-4 py-3 text-sm">
        <span className="flex items-center gap-2 text-text">
          <ExternalLink size={16} className="text-primary-hover" />
          رابط الطلب أونلاين (سفري/توصيل) — شاركه مع زبائنك:
          <code className="rounded bg-surface-2 px-2 py-0.5 font-mono text-xs text-muted" dir="ltr">{onlineUrl}</code>
        </span>
        <span className="flex gap-2">
          <Button size="sm" variant="outline" icon={copied ? <Check size={14} /> : <Copy size={14} />}
            onClick={() => { navigator.clipboard?.writeText(onlineUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>
            {copied ? 'تم' : 'نسخ'}
          </Button>
          <a href={onlineUrl} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost">فتح</Button></a>
        </span>
      </div>

      {/* حالة الوردية */}
      <div className={`mb-5 rounded-lg border px-4 py-2.5 text-sm ${shift ? 'border-success/30 bg-success/8' : 'border-warning/30 bg-warning/8'}`}>
        {shift ? (
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5 font-bold text-success"><Wallet size={15} /> وردية مفتوحة</span>
            <span className="text-muted">مبيعات الوردية: <b className="text-gold">{money(shift.sales)}</b></span>
            <span className="text-muted">المتوقّع بالدرج: <b className="text-text">{money(shift.expected_cash)}</b></span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-warning">
            <Wallet size={15} /> لا توجد وردية مفتوحة — افتح وردية من شاشة الطاولات لبدء اليوم.
          </span>
        )}
      </div>

      {/* بطاقات اليوم */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="مبيعات اليوم" value={money(s?.sales ?? 0)} icon={<Wallet size={20} />} tone="gold" />
        <StatCard label="عدد الفواتير" value={String(s?.bills ?? 0)} icon={<Receipt size={20} />} tone="info" />
        <StatCard label="متوسط الفاتورة" value={money(s?.avg_ticket ?? 0)} icon={<TrendingUp size={20} />} tone="success" />
        <StatCard label="الطاولات المشغولة" value={`${openTables} / ${openTables + freeTables}`} icon={<Armchair size={20} />} tone="warning" />
      </div>

      {/* نقد/شبكة + أنواع الطلبات */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="نقدًا" value={money(s?.cash ?? 0)} icon={<Banknote size={20} />} tone="success" />
        <StatCard label="شبكة" value={money(s?.card ?? 0)} icon={<CreditCard size={20} />} tone="info" />
        <StatCard label="صالة" value={money(s?.dine_in ?? 0)} icon={<Armchair size={18} />} tone="gold" />
        <StatCard label="سفري" value={money(s?.takeaway ?? 0)} icon={<Receipt size={18} />} tone="gold" />
        <StatCard label="توصيل" value={money(s?.delivery ?? 0)} icon={<Receipt size={18} />} tone="gold" />
      </div>

      {/* الأكثر مبيعًا اليوم */}
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-text">
        <Trophy size={18} className="text-primary-hover" /> الأكثر مبيعًا اليوم
      </h2>
      {!rep || rep.top_items.length === 0 ? (
        <EmptyState message="لا مبيعات بعد اليوم" icon={<Trophy size={24} />} />
      ) : (
        <Table head={<><th>الصنف</th><th>الكمية</th><th>الإيراد</th></>}>
          {rep.top_items.slice(0, 8).map((it, i) => (
            <tr key={i}>
              <td className="font-semibold">{it.name}</td>
              <td>{it.qty}</td>
              <td className="text-gold">{money(it.revenue)}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
