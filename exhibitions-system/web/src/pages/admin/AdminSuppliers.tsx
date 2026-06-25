import { useEffect, useState } from 'react';
import { Truck, Banknote } from 'lucide-react';
import { adminApi } from '../../lib/api';
import type { SupplierBalance } from '../../lib/types';
import {
  Button,
  Dialog,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Table,
  useToast,
} from '../../components/ui';
import { sar, currencyLabel } from '../../lib/format';

export default function AdminSuppliers() {
  const [rows, setRows] = useState<SupplierBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payTarget, setPayTarget] = useState<SupplierBalance | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setRows(await adminApi.supplierBalances());
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

  return (
    <div>
      <PageHeader
        title="الموردون"
        subtitle="أرصدة الموردين وتسجيل الدفعات"
        icon={<Truck size={22} />}
      />
      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState message="لا يوجد موردون" icon={<Truck size={26} />} />
      ) : (
        <Table
          head={
            <>
              <th>المورد</th>
              <th>الهاتف</th>
              <th>إجمالي المشتريات</th>
              <th>المدفوع</th>
              <th>الرصيد المستحق</th>
              <th></th>
            </>
          }
        >
          {rows.map((s) => (
            <tr key={s.id}>
              <td className="font-semibold">{s.name}</td>
              <td className="text-muted">{s.phone || '—'}</td>
              <td>{sar(s.purchased)}</td>
              <td className="text-success">{sar(s.paid)}</td>
              <td
                className={`font-bold ${
                  s.balance > 0 ? 'text-danger' : 'text-success'
                }`}
              >
                {sar(s.balance)}
              </td>
              <td>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Banknote size={15} />}
                  onClick={() => setPayTarget(s)}
                >
                  تسجيل دفعة
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {payTarget && (
        <PayDialog
          supplier={payTarget}
          onClose={() => setPayTarget(null)}
          onPaid={() => {
            setPayTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function PayDialog({
  supplier,
  onClose,
  onPaid,
}: {
  supplier: SupplierBalance;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'card'>('cash');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error('أدخل مبلغًا صحيحًا');
      return;
    }
    setBusy(true);
    try {
      await adminApi.paySupplier(supplier.id, amt, method, notes.trim());
      toast.success(`تم تسجيل دفعة بقيمة ${sar(amt)}`);
      onPaid();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`تسجيل دفعة — ${supplier.name}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form="pay-supplier-form" type="submit" loading={busy}>
            تأكيد الدفعة
          </Button>
        </>
      }
    >
      <form id="pay-supplier-form" onSubmit={submit} className="space-y-4">
        <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">
          <span className="text-muted">الرصيد المستحق الحالي: </span>
          <span
            className={`font-bold ${
              supplier.balance > 0 ? 'text-danger' : 'text-success'
            }`}
          >
            {sar(supplier.balance)}
          </span>
        </div>
        <Field label={`المبلغ (${currencyLabel()})`}>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label="طريقة الدفع">
          <Select
            value={method}
            onChange={(e) => setMethod(e.target.value as 'cash' | 'card')}
          >
            <option value="cash">نقدًا</option>
            <option value="card">شبكة</option>
          </Select>
        </Field>
        <Field label="ملاحظات">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="اختياري"
          />
        </Field>
      </form>
    </Dialog>
  );
}
