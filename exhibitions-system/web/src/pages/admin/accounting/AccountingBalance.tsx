import { useEffect, useState } from 'react';
import { Scale } from 'lucide-react';
import { accountingApi } from '../../../lib/api';
import type { BalanceSheet, BalanceSheetLine } from '../../../lib/types';
import {
  Button,
  Card,
  CardHeader,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Spinner,
} from '../../../components/ui';
import { sar } from '../../../lib/format';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function Section({
  title,
  lines,
  total,
}: {
  title: string;
  lines: BalanceSheetLine[];
  total: number;
}) {
  return (
    <Card>
      <CardHeader title={title} />
      <div className="text-sm">
        {lines.length === 0 ? (
          <p className="py-2 text-muted">لا توجد بنود</p>
        ) : (
          lines.map((l) => (
            <div
              key={l.code}
              className="flex items-center justify-between border-b border-white/5 py-2"
            >
              <span className="text-muted">
                <span className="text-xs">{l.code}</span> — {l.name}
              </span>
              <span className="font-semibold text-text">{sar(l.balance)}</span>
            </div>
          ))
        )}
        <div className="mt-2 flex items-center justify-between pt-2">
          <span className="font-bold text-text">الإجمالي</span>
          <span className="font-bold text-gold">{sar(total)}</span>
        </div>
      </div>
    </Card>
  );
}

export default function AccountingBalance() {
  const [asOf, setAsOf] = useState(today());
  const [data, setData] = useState<BalanceSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setData(await accountingApi.balanceSheet(asOf));
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

  const rhs = data
    ? data.total_liabilities + data.total_equity + data.net_income
    : 0;
  const balanced = data ? Math.abs(data.total_assets - rhs) < 0.01 : false;

  return (
    <div>
      <PageHeader
        title="الميزانية العمومية"
        subtitle="الأصول والخصوم وحقوق الملكية"
        icon={<Scale size={22} />}
      />
      <ErrorBanner message={error} />

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="كما في تاريخ">
            <Input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
          </Field>
          <Button onClick={load} loading={loading}>
            عرض
          </Button>
        </div>
      </Card>

      {loading ? (
        <Spinner />
      ) : data ? (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <Section
              title="الأصول"
              lines={data.assets}
              total={data.total_assets}
            />
            <Section
              title="الخصوم"
              lines={data.liabilities}
              total={data.total_liabilities}
            />
            <Section
              title="حقوق الملكية"
              lines={data.equity}
              total={data.total_equity}
            />
          </div>

          <div
            className={`ax-card flex flex-wrap items-center justify-between gap-3 p-5 ${
              balanced
                ? 'border border-success/30 bg-success/8'
                : 'border border-danger/30 bg-danger/8'
            }`}
          >
            <span
              className={`text-sm font-semibold ${
                balanced ? 'text-success' : 'text-danger'
              }`}
            >
              {balanced ? 'الميزانية متوازنة' : 'الميزانية غير متوازنة'}
            </span>
            <span className="text-sm text-muted">
              الأصول {sar(data.total_assets)} = الخصوم{' '}
              {sar(data.total_liabilities)} + حقوق الملكية{' '}
              {sar(data.total_equity)} + صافي الربح {sar(data.net_income)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
