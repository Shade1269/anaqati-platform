import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Trophy, Clock, Users, Tags } from 'lucide-react';
import { restaurantApi } from '../../lib/api';
import type { RestaurantReport } from '../../lib/types';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Spinner,
  Table,
} from '../../components/ui';
import { money } from '../../lib/format';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function monthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function RestaurantReports() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<RestaurantReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await restaurantApi.report(from, to));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = data?.summary;
  const maxHour = Math.max(1, ...(data?.by_hour || []).map((h) => h.sales));
  const netProfit = s ? (s.sales - s.tax - s.tips - (data?.cogs || 0)) : 0;

  return (
    <div>
      <PageHeader
        title="تقارير المطعم"
        subtitle="الأكثر مبيعًا، أوقات الذروة، أداء الموظفين"
        icon={<BarChart3 size={22} />}
      />

      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="من">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="إلى">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Button onClick={load} loading={loading}>عرض</Button>
        </div>
      </Card>

      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : !data || !s ? (
        <EmptyState message="لا بيانات" icon={<BarChart3 size={26} />} />
      ) : (
        <div className="space-y-6">
          {/* ملخص */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Stat label="المبيعات" value={money(s.sales)} tone="text-gold" />
            <Stat label="عدد الفواتير" value={String(s.bills)} />
            <Stat label="متوسط الفاتورة" value={money(s.avg_ticket)} />
            <Stat label="صافي الربح التقديري" value={money(netProfit)} tone={netProfit >= 0 ? 'text-success' : 'text-danger'} />
            <Stat label="صالة" value={money(s.dine_in)} />
            <Stat label="سفري" value={money(s.takeaway)} />
            <Stat label="توصيل" value={money(s.delivery)} />
            <Stat label="تكلفة المبيعات" value={money(data.cogs)} />
            <Stat label="نقدًا" value={money(s.cash)} />
            <Stat label="شبكة" value={money(s.card)} />
            <Stat label="الخصومات" value={money(s.discounts)} />
            <Stat label="الضريبة" value={money(s.tax)} />
          </div>

          {/* الأكثر مبيعًا */}
          <Section title="الأكثر مبيعًا" icon={<Trophy size={18} />}>
            {data.top_items.length === 0 ? (
              <p className="text-sm text-muted">لا بيانات</p>
            ) : (
              <Table head={<><th>الصنف</th><th>الكمية</th><th>الإيراد</th></>}>
                {data.top_items.map((it, i) => (
                  <tr key={i}>
                    <td className="font-semibold">{it.name}</td>
                    <td>{it.qty}</td>
                    <td className="text-gold">{money(it.revenue)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>

          {/* حسب التصنيف */}
          <Section title="المبيعات حسب التصنيف" icon={<Tags size={18} />}>
            {data.by_category.length === 0 ? (
              <p className="text-sm text-muted">لا بيانات</p>
            ) : (
              <Table head={<><th>التصنيف</th><th>الكمية</th><th>الإيراد</th></>}>
                {data.by_category.map((c, i) => (
                  <tr key={i}>
                    <td className="font-semibold">{c.name}</td>
                    <td>{c.qty}</td>
                    <td className="text-gold">{money(c.revenue)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>

          {/* المبيعات بالساعة */}
          <Section title="أوقات الذروة (المبيعات بالساعة)" icon={<Clock size={18} />}>
            {data.by_hour.length === 0 ? (
              <p className="text-sm text-muted">لا بيانات</p>
            ) : (
              <div className="space-y-1.5">
                {data.by_hour.map((h) => (
                  <div key={h.hour} className="flex items-center gap-2 text-xs">
                    <span className="w-16 shrink-0 text-muted">{String(h.hour).padStart(2, '0')}:00</span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-white/5">
                      <div
                        className="h-full rounded bg-primary/60"
                        style={{ width: `${Math.max(3, (h.sales / maxHour) * 100)}%` }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-left text-gold">{money(h.sales)}</span>
                    <span className="w-12 shrink-0 text-left text-muted">{h.bills} ف</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* أداء الموظفين */}
          <Section title="أداء الموظفين" icon={<Users size={18} />}>
            {data.staff.length === 0 ? (
              <p className="text-sm text-muted">لا بيانات</p>
            ) : (
              <Table head={<><th>الموظف</th><th>الفواتير</th><th>المبيعات</th></>}>
                {data.staff.map((st, i) => (
                  <tr key={i}>
                    <td className="font-semibold">{st.name}</td>
                    <td>{st.bills}</td>
                    <td className="text-gold">{money(st.sales)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-0.5 font-bold ${tone || 'text-text'}`}>{value}</div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-text">
        <span className="text-primary-hover">{icon}</span>
        {title}
      </h2>
      {children}
    </Card>
  );
}
