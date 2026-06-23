import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Waves } from 'lucide-react';
import { accountingApi } from '../../../lib/api';
import type { CashFlow } from '../../../lib/types';
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

export default function AccountingCashFlow() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(monthEnd());
  const [data, setData] = useState<CashFlow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setData(await accountingApi.cashFlow(from, to));
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

  const positive = (data?.net_change ?? 0) >= 0;

  return (
    <div>
      <PageHeader
        title="قائمة التدفق النقدي"
        subtitle="التدفقات الداخلة والخارجة وصافي التغيّر في النقد"
        icon={<Waves size={22} />}
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
              <p className="text-xs font-semibold text-muted">
                صافي التغيّر في النقد
              </p>
              <p
                className={`mt-1 text-3xl font-extrabold ${
                  positive ? 'text-success' : 'text-danger'
                }`}
              >
                {sar(data.net_change)}
              </p>
            </div>
            <div className="flex gap-6 text-sm">
              <div>
                <p className="text-muted">إجمالي الداخل</p>
                <p className="font-bold text-success">{sar(data.total_in)}</p>
              </div>
              <div>
                <p className="text-muted">إجمالي الخارج</p>
                <p className="font-bold text-danger">{sar(data.total_out)}</p>
              </div>
            </div>
          </div>

          <Card>
            <CardHeader
              title="التدفقات الداخلة"
              icon={<ArrowDownToLine size={18} />}
            />
            {data.inflows.length === 0 ? (
              <EmptyState message="لا توجد تدفقات داخلة" />
            ) : (
              <Table
                head={
                  <>
                    <th>البند</th>
                    <th>المبلغ</th>
                  </>
                }
              >
                {data.inflows.map((l, i) => (
                  <tr key={`${l.category}-${i}`}>
                    <td className="font-semibold">{l.category}</td>
                    <td className="font-semibold text-success">
                      {sar(l.amount)}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader
              title="التدفقات الخارجة"
              icon={<ArrowUpFromLine size={18} />}
            />
            {data.outflows.length === 0 ? (
              <EmptyState message="لا توجد تدفقات خارجة" />
            ) : (
              <Table
                head={
                  <>
                    <th>البند</th>
                    <th>المبلغ</th>
                  </>
                }
              >
                {data.outflows.map((l, i) => (
                  <tr key={`${l.category}-${i}`}>
                    <td className="font-semibold">{l.category}</td>
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
