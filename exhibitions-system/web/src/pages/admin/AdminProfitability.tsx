import { useCallback, useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { accountingApi } from '../../lib/api';
import type { ProfitRow } from '../../lib/types';
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
import { sar } from '../../lib/format';

type Tab = 'product' | 'branch' | 'employee' | 'customer';

const tabs: { key: Tab; label: string }[] = [
  { key: 'product', label: 'حسب الصنف' },
  { key: 'branch', label: 'حسب الفرع' },
  { key: 'employee', label: 'حسب الموظف' },
  { key: 'customer', label: 'حسب العميل (جملة)' },
];

function monthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function AdminProfitability() {
  const [tab, setTab] = useState<Tab>('product');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<ProfitRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const fn =
        tab === 'product'
          ? accountingApi.profitByProduct
          : tab === 'branch'
          ? accountingApi.profitByBranch
          : tab === 'employee'
          ? accountingApi.profitByEmployee
          : accountingApi.profitByCustomer;
      setRows(await fn(from, to));
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tab, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = rows.reduce(
    (a, r) => ({
      revenue: a.revenue + r.revenue,
      cost: a.cost + r.cost,
      profit: a.profit + r.profit,
    }),
    { revenue: 0, cost: 0, profit: 0 }
  );
  const totalMargin =
    totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

  const showCustomer = tab === 'customer';
  const showQty = tab === 'product';

  return (
    <div>
      <PageHeader
        title="تقارير الربحية"
        subtitle="الربح والهامش لكل صنف/فرع/موظف/عميل"
        icon={<TrendingUp size={22} />}
      />

      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="من تاريخ">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="إلى تاريخ">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Button onClick={load}>تحديث</Button>
        </div>
      </Card>

      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button
            key={t.key}
            variant={tab === t.key ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {!loading && rows.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="الإيراد" value={sar(totals.revenue)} tone="text-info" />
          <SummaryCard label="التكلفة" value={sar(totals.cost)} tone="text-muted" />
          <SummaryCard
            label="صافي الربح"
            value={sar(totals.profit)}
            tone={totals.profit >= 0 ? 'text-success' : 'text-danger'}
          />
          <SummaryCard
            label="الهامش"
            value={`${totalMargin.toFixed(1)}%`}
            tone="text-gold"
          />
        </div>
      )}

      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState message="لا توجد بيانات في هذه الفترة" icon={<TrendingUp size={26} />} />
      ) : (
        <Table
          head={
            <>
              <th>{showCustomer ? 'العميل' : 'الاسم'}</th>
              {showQty && <th>الكمية</th>}
              <th>الإيراد</th>
              <th>التكلفة</th>
              <th>الربح</th>
              {!showCustomer && <th>الهامش</th>}
            </>
          }
        >
          {rows.map((r, i) => (
            <tr key={r.id || r.name || i}>
              <td className="font-semibold">
                {r.name}
                {r.product_code && (
                  <span className="font-mono text-muted"> ({r.product_code})</span>
                )}
              </td>
              {showQty && <td className="text-muted">{r.qty}</td>}
              <td className="text-info">{sar(r.revenue)}</td>
              <td className="text-muted">{sar(r.cost)}</td>
              <td
                className={`font-bold ${
                  r.profit >= 0 ? 'text-success' : 'text-danger'
                }`}
              >
                {sar(r.profit)}
              </td>
              {!showCustomer && (
                <td className="text-gold">{(r.margin_pct ?? 0).toFixed(1)}%</td>
              )}
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-center">
      <div className="text-xs text-muted">{label}</div>
      <div className={`font-bold ${tone}`}>{value}</div>
    </div>
  );
}
