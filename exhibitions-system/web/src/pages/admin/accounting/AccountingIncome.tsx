import { useEffect, useState } from 'react';
import { Receipt, TrendingUp } from 'lucide-react';
import { accountingApi } from '../../../lib/api';
import type { IncomeStatement } from '../../../lib/types';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Spinner,
  Table,
} from '../../../components/ui';
import { sar } from '../../../lib/format';

function monthStart() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10);
}
function monthEnd() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
}

export default function AccountingIncome() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(monthEnd());
  const [data, setData] = useState<IncomeStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setData(await accountingApi.incomeStatement(from, to));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const revenueLines = (data?.lines || []).filter((l) => l.type === 'revenue');
  const expenseLines = (data?.lines || []).filter((l) => l.type === 'expense');
  const positive = (data?.net_profit ?? 0) >= 0;

  return (
    <div>
      <PageHeader
        title="قائمة الدخل"
        subtitle="الإيرادات والمصروفات وصافي الربح"
        icon={<TrendingUp size={22} />}
      />
      <ErrorBanner message={error} />

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="من">
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="إلى">
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <Button onClick={load} loading={loading}>
            عرض
          </Button>
        </div>
      </Card>

      {loading ? (
        <Spinner />
      ) : !data ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          <div
            className={`ax-card flex flex-wrap items-center justify-between gap-3 p-6 ${
              positive
                ? 'bg-gradient-to-bl from-success/15'
                : 'bg-gradient-to-bl from-danger/15'
            } to-transparent`}
          >
            <div>
              <p className="text-xs font-semibold text-muted">صافي الربح</p>
              <p
                className={`mt-1 text-3xl font-extrabold ${
                  positive ? 'text-success' : 'text-danger'
                }`}
              >
                {sar(data.net_profit)}
              </p>
            </div>
            <div className="flex gap-6 text-sm">
              <div>
                <p className="text-muted">الإيرادات</p>
                <p className="font-bold text-success">{sar(data.revenue)}</p>
              </div>
              <div>
                <p className="text-muted">المصروفات</p>
                <p className="font-bold text-danger">{sar(data.expenses)}</p>
              </div>
            </div>
          </div>

          <Card>
            <CardHeader title="الإيرادات" icon={<TrendingUp size={18} />} />
            {revenueLines.length === 0 ? (
              <EmptyState message="لا توجد إيرادات" />
            ) : (
              <Table
                head={
                  <>
                    <th>الرمز</th>
                    <th>الحساب</th>
                    <th>المبلغ</th>
                  </>
                }
              >
                {revenueLines.map((l) => (
                  <tr key={l.code}>
                    <td className="text-muted">{l.code}</td>
                    <td className="font-semibold">{l.name}</td>
                    <td className="font-semibold text-success">
                      {sar(l.amount)}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader title="المصروفات" icon={<Receipt size={18} />} />
            {expenseLines.length === 0 ? (
              <EmptyState message="لا توجد مصروفات" />
            ) : (
              <Table
                head={
                  <>
                    <th>الرمز</th>
                    <th>الحساب</th>
                    <th>المبلغ</th>
                  </>
                }
              >
                {expenseLines.map((l) => (
                  <tr key={l.code}>
                    <td className="text-muted">{l.code}</td>
                    <td className="font-semibold">{l.name}</td>
                    <td className="font-semibold text-danger">
                      {sar(l.amount)}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
