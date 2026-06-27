import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Wallet, Users, ShoppingCart, Store, Package, BarChart3, TrendingUp } from 'lucide-react';
import { accountingApi } from '../../lib/api';
import type { DistributionDashboard as DD } from '../../lib/types';
import { Button, EmptyState, ErrorBanner, PageHeader, Spinner, StatCard, Table } from '../../components/ui';
import { money } from '../../lib/format';

function fmtDate(s: string) {
  try { return new Date(s).toLocaleDateString('ar', { dateStyle: 'short' }); } catch { return s; }
}

export default function DistributionDashboard() {
  const [d, setD] = useState<DD | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true); setError('');
      try { setD(await accountingApi.distributionDashboard()); }
      catch (e) { setError((e as Error).message); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="لوحة التحكم"
        subtitle="نظرة عامة على التوزيع والذمم"
        icon={<LayoutDashboard size={22} />}
        action={
          <div className="flex gap-2">
            <Link to="/admin/wholesale"><Button size="sm" icon={<ShoppingCart size={15} />}>بيع جملة</Button></Link>
            <Link to="/admin/customers"><Button size="sm" variant="outline" icon={<Users size={15} />}>العملاء (الدين)</Button></Link>
          </div>
        }
      />
      <ErrorBanner message={error} />

      {!d ? (
        <EmptyState message="لا بيانات" icon={<BarChart3 size={26} />} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="ذمم العملاء المستحقة" value={money(d.total_receivable)} icon={<Wallet size={20} />} tone="gold" />
            <StatCard label="عملاء نشطون" value={String(d.customers_count)} icon={<Users size={20} />} tone="info" />
            <StatCard label="مبيعات الجملة (هذا الشهر)" value={money(d.wholesale_month_total)} icon={<ShoppingCart size={20} />} tone="success" />
            <StatCard label="طلبات الجملة (هذا الشهر)" value={String(d.wholesale_month_count)} icon={<Package size={20} />} tone="warning" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* كبار المدينين */}
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-text">
                <TrendingUp size={18} className="text-primary-hover" /> أكبر العملاء المدينين
              </h2>
              {d.top_debtors.length === 0 ? (
                <EmptyState message="لا ديون مستحقة" icon={<Users size={24} />} />
              ) : (
                <Table head={<><th>العميل</th><th>الهاتف</th><th>الرصيد المستحق</th></>}>
                  {d.top_debtors.map((c, i) => (
                    <tr key={i}>
                      <td className="font-semibold">{c.name}</td>
                      <td className="text-muted">{c.phone || '—'}</td>
                      <td className="font-bold text-danger">{money(c.balance)}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </div>

            {/* آخر طلبات الجملة */}
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-text">
                <ShoppingCart size={18} className="text-primary-hover" /> آخر طلبات الجملة
              </h2>
              {d.recent_wholesale.length === 0 ? (
                <EmptyState message="لا طلبات بعد" icon={<ShoppingCart size={24} />} />
              ) : (
                <Table head={<><th>العميل</th><th>المبلغ</th><th>التاريخ</th></>}>
                  {d.recent_wholesale.map((w, i) => (
                    <tr key={i}>
                      <td className="font-semibold">{w.customer_name || '—'}</td>
                      <td className="text-gold">{money(w.total)}</td>
                      <td className="text-muted">{fmtDate(w.created_at)}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-muted">
            <Store size={14} className="ms-1 inline text-primary-hover" /> تبيع أيضًا للمشتركين الآخرين (مطاعم/متاجر) عبر <Link to="/admin/market/listings" className="text-gold">السوق الداخلي</Link> — طلبات السوق هذا الشهر: <b className="text-text">{d.market_orders_month}</b>.
          </div>
        </div>
      )}
    </div>
  );
}
