import { useEffect, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { accountingApi } from '../../../lib/api';
import type { TrialBalanceRow } from '../../../lib/types';
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

export default function AccountingTrialBalance() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(monthEnd());
  const [rows, setRows] = useState<TrialBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setRows((await accountingApi.trialBalance(from, to)) || []);
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

  const totalDebit = rows.reduce((a, r) => a + (Number(r.debit) || 0), 0);
  const totalCredit = rows.reduce((a, r) => a + (Number(r.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <div>
      <PageHeader
        title="ميزان المراجعة"
        subtitle="مجموع المدين يساوي مجموع الدائن"
        icon={<ListChecks size={22} />}
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
      ) : rows.length === 0 ? (
        <EmptyState message="لا توجد حركات" />
      ) : (
        <Table
          head={
            <>
              <th>الرمز</th>
              <th>الحساب</th>
              <th>النوع</th>
              <th>مدين</th>
              <th>دائن</th>
              <th>الرصيد</th>
            </>
          }
        >
          {rows.map((r) => (
            <tr key={r.code}>
              <td className="text-muted">{r.code}</td>
              <td className="font-semibold">{r.name}</td>
              <td className="text-muted">{r.type}</td>
              <td>{r.debit ? sar(r.debit) : '—'}</td>
              <td>{r.credit ? sar(r.credit) : '—'}</td>
              <td className="font-semibold text-gold">{sar(r.balance)}</td>
            </tr>
          ))}
          <tr className="border-t border-white/10">
            <td colSpan={3} className="font-bold text-text">
              الإجمالي
            </td>
            <td
              className={`font-bold ${balanced ? 'text-success' : 'text-danger'}`}
            >
              {sar(totalDebit)}
            </td>
            <td
              className={`font-bold ${balanced ? 'text-success' : 'text-danger'}`}
            >
              {sar(totalCredit)}
            </td>
            <td>{balanced ? 'متوازن' : 'غير متوازن'}</td>
          </tr>
        </Table>
      )}
    </div>
  );
}
