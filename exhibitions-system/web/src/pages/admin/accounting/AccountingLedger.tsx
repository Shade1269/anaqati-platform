import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { accountingApi } from '../../../lib/api';
import type { AccountRow, LedgerRow } from '../../../lib/types';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Table,
} from '../../../components/ui';
import { fmtDate, sar } from '../../../lib/format';

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

export default function AccountingLedger() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [code, setCode] = useState('');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(monthEnd());
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    accountingApi
      .listAccounts()
      .then((a) => {
        setAccounts(a);
        if (a.length && !code) setCode(a[0].code);
      })
      .catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    if (!code) return;
    setLoading(true);
    setError('');
    try {
      setRows((await accountingApi.accountLedger(code, from, to)) || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // running balance computed client-side
  let running = 0;
  const withBalance = rows.map((r) => {
    running += (Number(r.debit) || 0) - (Number(r.credit) || 0);
    return { ...r, balance: running };
  });

  return (
    <div>
      <PageHeader
        title="دفتر الأستاذ / كشف حساب"
        subtitle="حركة حساب محدد خلال فترة"
        icon={<BookOpen size={22} />}
      />
      <ErrorBanner message={error} />

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="الحساب" className="min-w-56">
            <Select value={code} onChange={(e) => setCode(e.target.value)}>
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.name}
                </option>
              ))}
            </Select>
          </Field>
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
          <Button onClick={load} loading={loading} disabled={!code}>
            عرض
          </Button>
        </div>
      </Card>

      {loading ? (
        <Spinner />
      ) : withBalance.length === 0 ? (
        <EmptyState message="لا توجد حركات — اختر حسابًا واضغط عرض" />
      ) : (
        <Table
          head={
            <>
              <th>التاريخ</th>
              <th>البيان</th>
              <th>المصدر</th>
              <th>مدين</th>
              <th>دائن</th>
              <th>الرصيد</th>
            </>
          }
        >
          {withBalance.map((r, i) => (
            <tr key={i}>
              <td className="text-muted">{fmtDate(r.date)}</td>
              <td>{r.memo || '—'}</td>
              <td className="text-muted">{r.source || '—'}</td>
              <td>{r.debit ? sar(r.debit) : '—'}</td>
              <td>{r.credit ? sar(r.credit) : '—'}</td>
              <td className="font-semibold text-gold">{sar(r.balance)}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
