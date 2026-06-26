import { useEffect, useState } from 'react';
import {
  Users,
  Plus,
  Pencil,
  FileText,
  Banknote,
  Receipt,
} from 'lucide-react';
import { customersApi } from '../../lib/api';
import type { Customer, CustomerStatement } from '../../lib/types';
import {
  Badge,
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

function fmtDate(s: string): string {
  try {
    return new Date(s).toLocaleString('ar', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return s;
  }
}

export default function AdminCustomers() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editTarget, setEditTarget] = useState<Customer | null | 'new'>(null);
  const [chargeTarget, setChargeTarget] = useState<Customer | null>(null);
  const [payTarget, setPayTarget] = useState<Customer | null>(null);
  const [stmtTarget, setStmtTarget] = useState<Customer | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setRows(await customersApi.list());
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

  const totalDebt = rows.reduce((s, c) => s + (c.balance > 0 ? c.balance : 0), 0);

  return (
    <div>
      <PageHeader
        title="العملاء (الدين)"
        subtitle="حسابات العملاء والبيع الآجل وكشوف الحساب"
        icon={<Users size={22} />}
        action={
          <Button icon={<Plus size={16} />} onClick={() => setEditTarget('new')}>
            عميل جديد
          </Button>
        }
      />
      <ErrorBanner message={error} />

      {!loading && rows.length > 0 && (
        <div className="mb-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">
          <span className="text-muted">إجمالي الديون المستحقة على العملاء: </span>
          <span className="font-bold text-danger">{sar(totalDebt)}</span>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState message="لا يوجد عملاء بعد" icon={<Users size={26} />} />
      ) : (
        <Table
          head={
            <>
              <th>العميل</th>
              <th>الهاتف</th>
              <th>الحالة</th>
              <th>الرصيد (الدين)</th>
              <th></th>
            </>
          }
        >
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="font-semibold">{c.name}</td>
              <td className="text-muted">{c.phone || '—'}</td>
              <td>
                {c.is_active ? (
                  <Badge tone="success">نشط</Badge>
                ) : (
                  <Badge tone="neutral">موقوف</Badge>
                )}
              </td>
              <td
                className={`font-bold ${
                  c.balance > 0
                    ? 'text-danger'
                    : c.balance < 0
                    ? 'text-success'
                    : ''
                }`}
              >
                {sar(c.balance)}
              </td>
              <td>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Receipt size={15} />}
                    onClick={() => setChargeTarget(c)}
                  >
                    دين/آجل
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Banknote size={15} />}
                    onClick={() => setPayTarget(c)}
                  >
                    تسديد
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<FileText size={15} />}
                    onClick={() => setStmtTarget(c)}
                  >
                    كشف حساب
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Pencil size={15} />}
                    onClick={() => setEditTarget(c)}
                  >
                    تعديل
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {editTarget && (
        <EditDialog
          customer={editTarget === 'new' ? null : editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            load();
          }}
        />
      )}
      {chargeTarget && (
        <ChargeDialog
          customer={chargeTarget}
          onClose={() => setChargeTarget(null)}
          onDone={() => {
            setChargeTarget(null);
            load();
          }}
        />
      )}
      {payTarget && (
        <PaymentDialog
          customer={payTarget}
          onClose={() => setPayTarget(null)}
          onDone={() => {
            setPayTarget(null);
            load();
          }}
        />
      )}
      {stmtTarget && (
        <StatementDialog
          customer={stmtTarget}
          onClose={() => setStmtTarget(null)}
        />
      )}
    </div>
  );
}

function EditDialog({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(customer?.name || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [note, setNote] = useState(customer?.note || '');
  const [active, setActive] = useState(customer?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('أدخل اسم العميل');
      return;
    }
    setBusy(true);
    try {
      await customersApi.set(
        customer?.id || null,
        name.trim(),
        phone.trim() || null,
        note.trim() || null,
        active
      );
      toast.success(customer ? 'تم تحديث العميل' : 'تم إضافة العميل');
      onSaved();
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
      title={customer ? `تعديل — ${customer.name}` : 'عميل جديد'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form="customer-form" type="submit" loading={busy}>
            حفظ
          </Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={submit} className="space-y-4">
        <Field label="الاسم">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label="الهاتف">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="اختياري"
          />
        </Field>
        <Field label="ملاحظات">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="اختياري"
          />
        </Field>
        <Field label="الحالة">
          <Select
            value={active ? '1' : '0'}
            onChange={(e) => setActive(e.target.value === '1')}
          >
            <option value="1">نشط</option>
            <option value="0">موقوف</option>
          </Select>
        </Field>
      </form>
    </Dialog>
  );
}

function ChargeDialog({
  customer,
  onClose,
  onDone,
}: {
  customer: Customer;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
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
      await customersApi.charge(customer.id, amt, note.trim() || null);
      toast.success(`تم تسجيل دين بقيمة ${sar(amt)}`);
      onDone();
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
      title={`تسجيل دين/بيع آجل — ${customer.name}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form="charge-form" type="submit" loading={busy}>
            تأكيد
          </Button>
        </>
      }
    >
      <form id="charge-form" onSubmit={submit} className="space-y-4">
        <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">
          <span className="text-muted">الرصيد الحالي: </span>
          <span className="font-bold text-danger">{sar(customer.balance)}</span>
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
        <Field label="ملاحظات">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="اختياري"
          />
        </Field>
      </form>
    </Dialog>
  );
}

function PaymentDialog({
  customer,
  onClose,
  onDone,
}: {
  customer: Customer;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'card'>('cash');
  const [note, setNote] = useState('');
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
      await customersApi.payment(customer.id, amt, method, note.trim() || null);
      toast.success(`تم تسجيل تسديد بقيمة ${sar(amt)}`);
      onDone();
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
      title={`تسجيل تسديد — ${customer.name}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form="payment-form" type="submit" loading={busy}>
            تأكيد التسديد
          </Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={submit} className="space-y-4">
        <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">
          <span className="text-muted">الرصيد الحالي: </span>
          <span className="font-bold text-danger">{sar(customer.balance)}</span>
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
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="اختياري"
          />
        </Field>
      </form>
    </Dialog>
  );
}

function StatementDialog({
  customer,
  onClose,
}: {
  customer: Customer;
  onClose: () => void;
}) {
  const [data, setData] = useState<CustomerStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        setData(await customersApi.statement(customer.id));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [customer.id]);

  return (
    <Dialog
      open
      onClose={onClose}
      title={`كشف حساب — ${customer.name}`}
      size="lg"
      footer={
        <Button variant="ghost" onClick={onClose}>
          إغلاق
        </Button>
      }
    >
      <ErrorBanner message={error} />
      {loading ? (
        <Spinner />
      ) : data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
              <div className="text-xs text-muted">إجمالي الديون</div>
              <div className="font-bold text-danger">
                {sar(data.total_charged)}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
              <div className="text-xs text-muted">إجمالي التسديد</div>
              <div className="font-bold text-success">
                {sar(data.total_paid)}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
              <div className="text-xs text-muted">الرصيد</div>
              <div
                className={`font-bold ${
                  data.balance > 0 ? 'text-danger' : 'text-success'
                }`}
              >
                {sar(data.balance)}
              </div>
            </div>
          </div>

          {data.entries.length === 0 ? (
            <EmptyState message="لا توجد حركات" icon={<FileText size={24} />} />
          ) : (
            <Table
              head={
                <>
                  <th>التاريخ</th>
                  <th>النوع</th>
                  <th>المبلغ</th>
                  <th>طريقة</th>
                  <th>ملاحظات</th>
                </>
              }
            >
              {data.entries.map((e) => (
                <tr key={e.id}>
                  <td className="text-muted whitespace-nowrap">
                    {fmtDate(e.created_at)}
                  </td>
                  <td>
                    {e.kind === 'charge' ? (
                      <Badge tone="danger">دين/آجل</Badge>
                    ) : (
                      <Badge tone="success">تسديد</Badge>
                    )}
                  </td>
                  <td
                    className={`font-semibold ${
                      e.kind === 'charge' ? 'text-danger' : 'text-success'
                    }`}
                  >
                    {sar(e.amount)}
                  </td>
                  <td className="text-muted">
                    {e.method === 'card'
                      ? 'شبكة'
                      : e.method === 'cash'
                      ? 'نقدًا'
                      : '—'}
                  </td>
                  <td className="text-muted">{e.note || '—'}</td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
