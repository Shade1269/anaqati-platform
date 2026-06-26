import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Trophy, Clock, Users, Store, TrendingUp, TrendingDown } from 'lucide-react';
import { accountingApi } from '../../lib/api';
import type { RetailReport } from '../../lib/types';
import { Button, Card, EmptyState, ErrorBanner, Field, Input, PageHeader, Spinner, Table } from '../../components/ui';
import { money } from '../../lib/format';

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(s: string, n: number) { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); }
function daysBetween(a: string, b: string) { return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000) + 1; }
function todayStr() { return iso(new Date()); }
function monthStart() { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), 1)); }

type Preset = 'today' | 'yesterday' | '7d' | 'month' | 'custom';

export default function AdminAnalytics() {
  const [preset, setPreset] = useState<Preset>('7d');
  const [from, setFrom] = useState(addDays(todayStr(), -6));
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState<RetailReport | null>(null);
  const [prev, setPrev] = useState<RetailReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true); setError('');
    try {
      const len = daysBetween(f, t);
      const pTo = addDays(f, -1); const pFrom = addDays(pTo, -(len - 1));
      const [cur, prv] = await Promise.all([accountingApi.retailReport(f, t), accountingApi.retailReport(pFrom, pTo)]);
      setData(cur); setPrev(prv);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(from, to); /* eslint-disable-next-line */ }, []);

  function applyPreset(p: Preset) {
    setPreset(p);
    let f = from, t = to;
    if (p === 'today') { f = todayStr(); t = todayStr(); }
    else if (p === 'yesterday') { f = addDays(todayStr(), -1); t = addDays(todayStr(), -1); }
    else if (p === '7d') { f = addDays(todayStr(), -6); t = todayStr(); }
    else if (p === 'month') { f = monthStart(); t = todayStr(); }
    if (p !== 'custom') { setFrom(f); setTo(t); load(f, t); }
  }

  const s = data?.summary; const ps = prev?.summary;
  const cogs = data?.cogs ?? 0;
  const net = s ? s.sales - cogs : 0;
  const prevNet = ps ? ps.sales - (prev?.cogs ?? 0) : 0;
  const maxDay = Math.max(1, ...(data?.by_day || []).map((d) => d.sales));
  const maxHour = Math.max(1, ...(data?.by_hour || []).map((h) => h.sales));
  const presets: { k: Preset; label: string }[] = [
    { k: 'today', label: 'اليوم' }, { k: 'yesterday', label: 'أمس' },
    { k: '7d', label: 'آخر ٧ أيام' }, { k: 'month', label: 'هذا الشهر' }, { k: 'custom', label: 'مخصّص' },
  ];

  return (
    <div>
      <PageHeader title="التحليلات" subtitle="مؤشرات الأداء والاتجاهات مقارنةً بالفترة السابقة" icon={<BarChart3 size={22} />} />
      <Card className="mb-5">
        <div className="mb-3 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button key={p.k} onClick={() => applyPreset(p.k)}
              className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${preset === p.k ? 'bg-primary text-black' : 'bg-surface-2 text-muted hover:text-text'}`}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex flex-wrap items-end gap-3">
            <Field label="من"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="إلى"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <Button onClick={() => load(from, to)} loading={loading}>عرض</Button>
          </div>
        )}
      </Card>
      <ErrorBanner message={error} />
      {loading ? <Spinner /> : !data || !s ? <EmptyState message="لا بيانات" icon={<BarChart3 size={26} />} /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="المبيعات" value={money(s.sales)} cur={s.sales} prev={ps?.sales} />
            <Kpi label="عدد الفواتير" value={String(s.bills)} cur={s.bills} prev={ps?.bills} />
            <Kpi label="متوسط الفاتورة" value={money(s.avg_ticket)} cur={s.avg_ticket} prev={ps?.avg_ticket} />
            <Kpi label="إجمالي الربح" value={money(net)} cur={net} prev={prevNet} tone />
          </div>

          <Card>
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-text"><TrendingUp size={18} className="text-primary-hover" /> اتجاه المبيعات اليومي</h2>
            {data.by_day.length === 0 ? <p className="text-sm text-muted">لا بيانات</p> : (
              <div className="flex h-44 items-end gap-1.5 overflow-x-auto pt-2">
                {data.by_day.map((d) => (
                  <div key={d.d} className="flex min-w-[28px] flex-1 flex-col items-center gap-1" title={`${d.d}: ${money(d.sales)}`}>
                    <span className="text-[9px] text-gold">{Math.round(d.sales)}</span>
                    <div className="flex w-full items-end" style={{ height: '120px' }}>
                      <div className="w-full rounded-t bg-primary/60" style={{ height: `${Math.max(4, (d.sales / maxDay) * 100)}%` }} />
                    </div>
                    <span className="whitespace-nowrap text-[9px] text-muted">{d.d.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 text-base font-bold text-text">حسب طريقة الدفع</h2>
              <Bar label="نقدًا" value={s.cash} total={s.sales} tone="bg-success/60" />
              <Bar label="شبكة" value={s.card} total={s.sales} tone="bg-info/60" />
            </Card>
            <Sec title="حسب المعرض" icon={<Store size={18} />}>
              {data.by_branch.length === 0 ? <p className="text-sm text-muted">لا بيانات</p> : (
                <Table head={<><th>المعرض</th><th>الفواتير</th><th>المبيعات</th></>}>
                  {data.by_branch.map((b, i) => (<tr key={i}><td className="font-semibold">{b.name}</td><td>{b.bills}</td><td className="text-gold">{money(b.sales)}</td></tr>))}
                </Table>
              )}
            </Sec>
          </div>

          <Card>
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-text"><Clock size={18} className="text-primary-hover" /> أوقات الذروة</h2>
            {data.by_hour.length === 0 ? <p className="text-sm text-muted">لا بيانات</p> : (
              <div className="space-y-1.5">
                {data.by_hour.map((h) => (
                  <div key={h.hour} className="flex items-center gap-2 text-xs">
                    <span className="w-14 shrink-0 text-muted">{String(h.hour).padStart(2, '0')}:00</span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-white/5"><div className="h-full rounded bg-primary/60" style={{ width: `${Math.max(3, (h.sales / maxHour) * 100)}%` }} /></div>
                    <span className="w-24 shrink-0 text-left text-gold">{money(h.sales)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Sec title="الأكثر مبيعًا" icon={<Trophy size={18} />}>
              {data.top_items.length === 0 ? <p className="text-sm text-muted">لا بيانات</p> : (
                <Table head={<><th>المنتج</th><th>الكمية</th><th>الإيراد</th></>}>
                  {data.top_items.map((it, i) => (<tr key={i}><td className="font-semibold">{it.name}</td><td>{it.qty}</td><td className="text-gold">{money(it.revenue)}</td></tr>))}
                </Table>
              )}
            </Sec>
            <Sec title="أداء الموظفين" icon={<Users size={18} />}>
              {data.staff.length === 0 ? <p className="text-sm text-muted">لا بيانات</p> : (
                <Table head={<><th>الموظف</th><th>الفواتير</th><th>المبيعات</th></>}>
                  {data.staff.map((st, i) => (<tr key={i}><td className="font-semibold">{st.name}</td><td>{st.bills}</td><td className="text-gold">{money(st.sales)}</td></tr>))}
                </Table>
              )}
            </Sec>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, cur, prev, tone }: { label: string; value: string; cur: number; prev?: number; tone?: boolean }) {
  const hasPrev = prev !== undefined && prev !== null;
  const delta = hasPrev && prev! !== 0 ? ((cur - prev!) / Math.abs(prev!)) * 100 : null;
  const up = (delta ?? 0) >= 0;
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-0.5 text-lg font-extrabold ${tone ? (cur >= 0 ? 'text-success' : 'text-danger') : 'text-text'}`}>{value}</div>
      {delta !== null ? (
        <div className={`mt-1 flex items-center gap-1 text-[11px] font-bold ${up ? 'text-success' : 'text-danger'}`}>
          {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{Math.abs(delta).toFixed(0)}% <span className="font-normal text-muted">عن السابق</span>
        </div>
      ) : null}
    </div>
  );
}
function Bar({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="mb-2.5">
      <div className="mb-1 flex items-center justify-between text-sm"><span className="text-muted">{label}</span>
        <span className="text-text">{money(value)} <span className="text-[11px] text-muted">({pct.toFixed(0)}%)</span></span></div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/5"><div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
function Sec({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (<Card><h2 className="mb-3 flex items-center gap-2 text-base font-bold text-text"><span className="text-primary-hover">{icon}</span>{title}</h2>{children}</Card>);
}
