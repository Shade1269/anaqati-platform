import { useEffect, useState } from 'react';
import { NotebookPen, Plus, Trash2 } from 'lucide-react';
import { accountingApi } from '../../../lib/api';
import type {
  AccountRow,
  JournalEntry,
  ManualJournalLine,
} from '../../../lib/types';
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  useToast,
} from '../../../components/ui';
import { fmtDate, sar } from '../../../lib/format';

interface LineForm {
  account: string;
  debit: string;
  credit: string;
}

const emptyLine: LineForm = { account: '', debit: '', credit: '' };

export default function AccountingJournal() {
  const toast = useToast();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [e, a] = await Promise.all([
        accountingApi.listJournal(),
        accountingApi.listAccounts(),
      ]);
      setEntries(e);
      setAccounts(a);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const accName = (c: string) =>
    accounts.find((a) => a.code === c)?.name || c;

  return (
    <div>
      <PageHeader
        title="القيود اليومية"
        subtitle="آخر 100 قيد محاسبي"
        icon={<NotebookPen size={22} />}
        action={
          <Button icon={<Plus size={16} />} onClick={() => setOpen(true)}>
            قيد يدوي جديد
          </Button>
        }
      />
      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : entries.length === 0 ? (
        <EmptyState message="لا توجد قيود" />
      ) : (
        <div className="space-y-4">
          {entries.map((e) => {
            const totalD = e.journal_lines.reduce(
              (a, l) => a + (Number(l.debit) || 0),
              0
            );
            const totalC = e.journal_lines.reduce(
              (a, l) => a + (Number(l.credit) || 0),
              0
            );
            return (
              <Card key={e.id}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div>
                    <p className="font-semibold text-text">
                      {e.memo || 'قيد'}
                    </p>
                    <p className="text-xs text-muted">
                      {fmtDate(e.entry_date)}
                      {e.source_table ? ` · ${e.source_table}` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-muted">{sar(totalD)}</span>
                </div>
                <div className="space-y-1 text-sm">
                  {e.journal_lines.map((l, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="text-muted">
                        <span className="text-xs">{l.account_code}</span> —{' '}
                        {accName(l.account_code)}
                      </span>
                      <span className="flex gap-6">
                        <span className="w-24 text-left">
                          {l.debit ? sar(l.debit) : ''}
                        </span>
                        <span className="w-24 text-left text-muted">
                          {l.credit ? sar(l.credit) : ''}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-end gap-6 border-t border-white/5 pt-2 text-xs font-bold">
                  <span className="w-24 text-left text-gold">
                    {sar(totalD)}
                  </span>
                  <span className="w-24 text-left text-gold">
                    {sar(totalC)}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {open && (
        <ManualJournalDialog
          accounts={accounts}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            load();
          }}
          toastSuccess={toast.success}
          toastError={toast.error}
        />
      )}
    </div>
  );
}

function ManualJournalDialog({
  accounts,
  onClose,
  onSaved,
  toastSuccess,
  toastError,
}: {
  accounts: AccountRow[];
  onClose: () => void;
  onSaved: () => void;
  toastSuccess: (m: string) => void;
  toastError: (m: string) => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<LineForm[]>([
    { ...emptyLine },
    { ...emptyLine },
  ]);
  const [busy, setBusy] = useState(false);

  function update(i: number, patch: Partial<LineForm>) {
    setLines((s) => s.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((s) => [...s, { ...emptyLine }]);
  }
  function removeLine(i: number) {
    setLines((s) => (s.length > 2 ? s.filter((_, idx) => idx !== i) : s));
  }

  const totalD = lines.reduce((a, l) => a + (Number(l.debit) || 0), 0);
  const totalC = lines.reduce((a, l) => a + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(totalD - totalC) < 0.01 && totalD > 0;

  async function submit() {
    if (!memo.trim()) return toastError('أدخل بيان القيد');
    if (lines.some((l) => !l.account))
      return toastError('اختر الحساب لكل سطر');
    if (!balanced)
      return toastError('القيد غير متوازن: مجموع المدين يجب أن يساوي الدائن');
    setBusy(true);
    try {
      const payload: ManualJournalLine[] = lines.map((l) => ({
        account: l.account,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      }));
      await accountingApi.postManualJournal(date, memo.trim(), payload);
      toastSuccess('تم تسجيل القيد');
      onSaved();
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="قيد يدوي جديد"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={submit} loading={busy} disabled={!balanced}>
            حفظ القيد
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="التاريخ">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="البيان">
            <Input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="مثال: رأس المال"
            />
          </Field>
        </div>

        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <Field label="الحساب" className="min-w-44 flex-1">
                <Select
                  value={l.account}
                  onChange={(e) => update(i, { account: e.target.value })}
                >
                  <option value="">—</option>
                  {accounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="مدين" className="w-28">
                <Input
                  type="number"
                  step="0.01"
                  value={l.debit}
                  onChange={(e) => update(i, { debit: e.target.value })}
                />
              </Field>
              <Field label="دائن" className="w-28">
                <Input
                  type="number"
                  step="0.01"
                  value={l.credit}
                  onChange={(e) => update(i, { credit: e.target.value })}
                />
              </Field>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={14} />}
                onClick={() => removeLine(i)}
                disabled={lines.length <= 2}
              />
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" icon={<Plus size={14} />} onClick={addLine}>
          إضافة سطر
        </Button>

        <div
          className={`flex items-center justify-between rounded-lg px-4 py-2.5 text-sm font-semibold ${
            balanced
              ? 'bg-success/10 text-success'
              : 'bg-danger/10 text-danger'
          }`}
        >
          <span>{balanced ? 'القيد متوازن' : 'القيد غير متوازن'}</span>
          <span>
            مدين {sar(totalD)} · دائن {sar(totalC)}
          </span>
        </div>
      </div>
    </Dialog>
  );
}
