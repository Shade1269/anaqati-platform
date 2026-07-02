import { useEffect, useState } from 'react';
import { ShieldCheck, Check, X, Plus, Trash2, SlidersHorizontal } from 'lucide-react';
import { approvalsApi } from '../../lib/api';
import type { ApprovalRequest, ApprovalRule, ApprovalKind } from '../../lib/types';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Table,
  useToast,
} from '../../components/ui';
import { sar } from '../../lib/format';

const KIND_LABEL: Record<ApprovalKind, string> = {
  expense: 'مصروف',
  discount: 'خصم',
  wholesale: 'بيع جملة',
  purchase: 'شراء',
  advance: 'سُلفة',
  other: 'أخرى',
};

function kindLabel(k: string): string {
  return KIND_LABEL[k as ApprovalKind] || k;
}

const ST: Record<string, { label: string; cls: string }> = {
  pending: { label: 'بانتظار', cls: 'bg-warning/15 text-warning' },
  approved: { label: 'معتمد', cls: 'bg-success/15 text-success' },
  rejected: { label: 'مرفوض', cls: 'bg-danger/15 text-danger' },
};

export default function AdminApprovals() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [rule, setRule] = useState({ kind: 'expense', threshold: '', is_active: true });
  const toast = useToast();

  async function load() {
    const [rq, rl] = await Promise.all([
      approvalsApi.requestsList(showAll ? null : 'pending'),
      approvalsApi.rulesList().catch(() => []),
    ]);
    setRequests(rq);
    setRules(rl);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll]);

  async function decide(r: ApprovalRequest, decision: 'approved' | 'rejected') {
    let note: string | null = null;
    if (decision === 'rejected') {
      note = window.prompt('سبب الرفض (اختياري):') ?? '';
    }
    try {
      await approvalsApi.decide(r.id, decision, note);
      toast.success(decision === 'approved' ? 'تم الاعتماد' : 'تم الرفض');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    try {
      await approvalsApi.ruleSet(null, rule.kind, Number(rule.threshold) || 0, rule.is_active);
      toast.success('تمت إضافة القاعدة');
      setRule({ kind: 'expense', threshold: '', is_active: true });
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function toggleRule(r: ApprovalRule) {
    try {
      await approvalsApi.ruleSet(r.id, r.kind, r.threshold, !r.is_active);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function delRule(r: ApprovalRule) {
    if (!confirm('حذف القاعدة؟')) return;
    try {
      await approvalsApi.ruleDelete(r.id);
      setRules((cur) => cur.filter((x) => x.id !== r.id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (loading) return <Spinner />;

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div>
      <PageHeader
        title="الموافقات"
        subtitle="اعتمد أو ارفض الطلبات، وحدّد قواعد الموافقة حسب المبلغ"
        icon={<ShieldCheck size={22} />}
        action={
          <Button variant="outline" size="sm" onClick={() => setShowAll((s) => !s)}>
            {showAll ? 'عرض المعلّقة فقط' : 'عرض الكل'}
          </Button>
        }
      />

      <Card className="mb-6">
        <CardHeader
          title={`طلبات الموافقة${!showAll ? ` (${pendingCount})` : ''}`}
          icon={<ShieldCheck size={18} />}
        />
        {requests.length === 0 ? (
          <EmptyState message="لا توجد طلبات" icon={<ShieldCheck size={26} />} />
        ) : (
          <Table
            head={
              <>
                <th>النوع</th>
                <th>الوصف</th>
                <th>المبلغ</th>
                <th>مقدّم الطلب</th>
                <th>الحالة</th>
                <th></th>
              </>
            }
          >
            {requests.map((r) => {
              const st = ST[r.status];
              return (
                <tr key={r.id}>
                  <td>
                    <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-bold text-text">
                      {kindLabel(r.kind)}
                    </span>
                  </td>
                  <td className="font-semibold">{r.title || '—'}</td>
                  <td className="font-bold text-gold">{sar(r.amount)}</td>
                  <td className="text-muted">{r.requested_by_name || '—'}</td>
                  <td>
                    <span className={`rounded px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>
                  </td>
                  <td>
                    {r.status === 'pending' ? (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => decide(r, 'approved')}
                          className="rounded p-1.5 text-success transition hover:bg-success/10"
                          title="اعتماد"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={() => decide(r, 'rejected')}
                          className="rounded p-1.5 text-danger transition hover:bg-danger/10"
                          title="رفض"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted">{r.decided_by_name || ''}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="قواعد الموافقة" icon={<SlidersHorizontal size={18} />} />
        <p className="mb-4 text-sm text-muted">
          إذا كان مبلغ العملية أكبر من أو يساوي الحدّ، تُرسَل تلقائيًا لموافقة المالك.
        </p>
        <form onSubmit={addRule} className="mb-5 grid gap-3 sm:grid-cols-4">
          <Field label="النوع">
            <Select value={rule.kind} onChange={(e) => setRule({ ...rule, kind: e.target.value })}>
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="الحدّ (يتطلب موافقة عنده فأكثر)">
            <Input
              type="number"
              value={rule.threshold}
              onChange={(e) => setRule({ ...rule, threshold: e.target.value })}
              placeholder="0"
            />
          </Field>
          <Field label="مفعّلة">
            <Select
              value={rule.is_active ? '1' : '0'}
              onChange={(e) => setRule({ ...rule, is_active: e.target.value === '1' })}
            >
              <option value="1">نعم</option>
              <option value="0">لا</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <Button type="submit" icon={<Plus size={16} />} className="w-full">
              إضافة قاعدة
            </Button>
          </div>
        </form>

        {rules.length === 0 ? (
          <EmptyState message="لا قواعد بعد — كل العمليات تُرحّل مباشرة" icon={<SlidersHorizontal size={24} />} />
        ) : (
          <Table
            head={
              <>
                <th>النوع</th>
                <th>الحدّ</th>
                <th>الحالة</th>
                <th></th>
              </>
            }
          >
            {rules.map((r) => (
              <tr key={r.id}>
                <td className="font-semibold">{kindLabel(r.kind)}</td>
                <td className="text-gold">{sar(r.threshold)}</td>
                <td>
                  <button
                    onClick={() => toggleRule(r)}
                    className={`rounded px-2 py-0.5 text-xs font-bold ${
                      r.is_active ? 'bg-success/15 text-success' : 'bg-white/10 text-muted'
                    }`}
                  >
                    {r.is_active ? 'مفعّلة' : 'متوقفة'}
                  </button>
                </td>
                <td>
                  <button
                    onClick={() => delRule(r)}
                    className="rounded p-1.5 text-danger transition hover:bg-danger/10"
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
