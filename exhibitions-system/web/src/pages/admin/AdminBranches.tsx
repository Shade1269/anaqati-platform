import { useEffect, useState } from 'react';
import { Store, Plus, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import type { Branch, BranchClosePreviewRow, Warehouse } from '../../lib/types';
import {
  Button,
  Card,
  CardHeader,
  Dialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  StatusBadge,
  Table,
  useToast,
} from '../../components/ui';
import { fmtDate, sar } from '../../lib/format';

interface ProfileRow {
  id: string;
  full_name: string;
}

const emptyForm = {
  name: '',
  location: '',
  start_date: '',
  end_date: '',
  target_amount_sar: '',
  commission_percentage: '',
  commission_mode: '',
  manager_id: '',
  source_warehouse_id: '',
};

const modeLabels: Record<string, string> = {
  single_manager: 'مدير واحد',
  proportional: 'تناسبي',
  manual_pool: 'تجميع يدوي',
};

export default function AdminBranches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [managers, setManagers] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [confirmBranch, setConfirmBranch] = useState<Branch | null>(null);
  const toast = useToast();

  async function load() {
    setLoading(true);
    const [b, w, p] = await Promise.all([
      supabase
        .from('branches')
        .select(
          'id,name,location,status,start_date,end_date,target_amount_sar,commission_percentage,commission_mode,manager_id,source_warehouse_id'
        )
        .order('name'),
      supabase.from('warehouses').select('id,name,location,is_active').order('name'),
      supabase.from('profiles').select('id,full_name').order('full_name'),
    ]);
    if (b.error) toast.error(b.error.message);
    setBranches((b.data as Branch[]) || []);
    setWarehouses((w.data as Warehouse[]) || []);
    setManagers((p.data as ProfileRow[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.from('branches').insert({
        name: form.name.trim(),
        location: form.location.trim() || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        target_amount_sar: form.target_amount_sar ? Number(form.target_amount_sar) : null,
        commission_percentage: form.commission_percentage
          ? Number(form.commission_percentage)
          : null,
        commission_mode: form.commission_mode || null,
        manager_id: form.manager_id || null,
        source_warehouse_id: form.source_warehouse_id || null,
        status: 'planning',
      });
      if (error) throw new Error(error.message);
      toast.success('تمت إضافة المعرض');
      setForm({ ...emptyForm });
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="المعارض"
        subtitle="إنشاء وإدارة المعارض المؤقتة"
        icon={<Store size={22} />}
      />

      <form onSubmit={create} className="mb-6">
        <Card>
          <CardHeader title="معرض جديد" icon={<Plus size={18} />} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="اسم المعرض">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
            <Field label="الموقع">
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </Field>
            <Field label="المستودع المصدر">
              <Select
                value={form.source_warehouse_id}
                onChange={(e) =>
                  setForm({ ...form, source_warehouse_id: e.target.value })
                }
              >
                <option value="">—</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="تاريخ البداية">
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </Field>
            <Field label="تاريخ النهاية">
              <Input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </Field>
            <Field label="الهدف (ر.س)">
              <Input
                type="number"
                step="0.01"
                value={form.target_amount_sar}
                onChange={(e) =>
                  setForm({ ...form, target_amount_sar: e.target.value })
                }
              />
            </Field>
            <Field label="نسبة العمولة %">
              <Input
                type="number"
                step="0.01"
                value={form.commission_percentage}
                onChange={(e) =>
                  setForm({ ...form, commission_percentage: e.target.value })
                }
              />
            </Field>
            <Field label="نمط العمولة">
              <Select
                value={form.commission_mode}
                onChange={(e) =>
                  setForm({ ...form, commission_mode: e.target.value })
                }
              >
                <option value="">—</option>
                <option value="single_manager">مدير واحد</option>
                <option value="proportional">تناسبي</option>
                <option value="manual_pool">تجميع يدوي</option>
              </Select>
            </Field>
            <Field label="المدير">
              <Select
                value={form.manager_id}
                onChange={(e) => setForm({ ...form, manager_id: e.target.value })}
              >
                <option value="">—</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-4">
            <Button type="submit" loading={saving}>
              إضافة معرض
            </Button>
          </div>
        </Card>
      </form>

      {loading ? (
        <Spinner />
      ) : branches.length === 0 ? (
        <EmptyState message="لا توجد معارض" icon={<Store size={26} />} />
      ) : (
        <Table
          head={
            <>
              <th>الاسم</th>
              <th>الموقع</th>
              <th>الفترة</th>
              <th>الهدف</th>
              <th>العمولة</th>
              <th>النمط</th>
              <th>الحالة</th>
              <th></th>
            </>
          }
        >
          {branches.map((b) => (
            <tr key={b.id}>
              <td className="font-semibold">{b.name}</td>
              <td className="text-muted">{b.location || '—'}</td>
              <td className="text-muted">
                {fmtDate(b.start_date)} ← {fmtDate(b.end_date)}
              </td>
              <td className="text-gold">{sar(b.target_amount_sar || 0)}</td>
              <td>
                {b.commission_percentage != null
                  ? `${b.commission_percentage}%`
                  : '—'}
              </td>
              <td className="text-muted">
                {b.commission_mode
                  ? modeLabels[b.commission_mode] || b.commission_mode
                  : '—'}
              </td>
              <td>
                <StatusBadge status={b.status} />
              </td>
              <td>
                {b.status !== 'closed' && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setConfirmBranch(b)}
                  >
                    إغلاق
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      {confirmBranch && (
        <CloseBranchDialog
          branch={confirmBranch}
          onCancel={() => setConfirmBranch(null)}
          onClosed={() => {
            setConfirmBranch(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CloseBranchDialog({
  branch,
  onCancel,
  onClosed,
}: {
  branch: Branch;
  onCancel: () => void;
  onClosed: () => void;
}) {
  const [rows, setRows] = useState<BranchClosePreviewRow[]>([]);
  const [received, setReceived] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setLoading(true);
    setError('');
    adminApi
      .branchClosePreview(branch.id)
      .then((data) => {
        const list = data || [];
        setRows(list);
        const init: Record<string, string> = {};
        list.forEach((r) => (init[r.product_id] = String(r.expected)));
        setReceived(init);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [branch.id]);

  const recvNum = (id: string, expected: number) => {
    const v = received[id];
    if (v === undefined || v === '') return 0;
    const n = Number(v);
    return Number.isNaN(n) ? expected : n;
  };

  const totalLoss = rows.reduce(
    (sum, r) => sum + (r.expected - recvNum(r.product_id, r.expected)),
    0
  );

  async function confirm() {
    setBusy(true);
    try {
      if (rows.length === 0) {
        // No inventory — fall back to the simple close.
        await adminApi.closeBranch(branch.id);
        toast.success('تم إغلاق المعرض');
        onClosed();
        return;
      }
      const counts = rows.map((r) => ({
        product_id: r.product_id,
        received: recvNum(r.product_id, r.expected),
      }));
      const res = await adminApi.reconcileAndCloseBranch(branch.id, counts);
      toast.success(`تم إغلاق المعرض — قيمة الفاقد: ${sar(res.loss_value)}`);
      onClosed();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onCancel}
      title={`إغلاق وجرد المعرض — ${branch.name}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            إلغاء
          </Button>
          <Button variant="danger" loading={busy} onClick={confirm}>
            تأكيد الإغلاق
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/8 px-4 py-3 text-sm text-warning">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>
            أدخل العدد الواصل فعليًا لكل منتج. الفرق بين المتوقع والواصل يُسجَّل
            كفاقد، ثم تُرجَع البضاعة الواصلة للمستودع ويُغلق المعرض نهائيًا.
          </span>
        </div>

        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/8 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState message="لا توجد بضاعة في المعرض — سيتم الإغلاق مباشرة" />
        ) : (
          <>
            <Table
              head={
                <>
                  <th>المنتج</th>
                  <th>الرمز</th>
                  <th>المتوقع</th>
                  <th>الواصل فعلًا</th>
                  <th>الفاقد</th>
                </>
              }
            >
              {rows.map((r) => {
                const loss = r.expected - recvNum(r.product_id, r.expected);
                return (
                  <tr key={r.product_id}>
                    <td className="font-semibold">{r.name}</td>
                    <td className="text-muted">{r.code || '—'}</td>
                    <td className="text-gold">{r.expected}</td>
                    <td>
                      <Input
                        type="number"
                        min="0"
                        className="w-24"
                        value={received[r.product_id] ?? ''}
                        onChange={(e) =>
                          setReceived((s) => ({
                            ...s,
                            [r.product_id]: e.target.value,
                          }))
                        }
                      />
                    </td>
                    <td
                      className={`font-bold ${
                        loss !== 0 ? 'text-danger' : 'text-success'
                      }`}
                    >
                      {loss}
                    </td>
                  </tr>
                );
              })}
            </Table>
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">
              <span className="font-semibold text-muted">إجمالي الفاقد</span>
              <span
                className={`text-lg font-extrabold ${
                  totalLoss !== 0 ? 'text-danger' : 'text-success'
                }`}
              >
                {totalLoss} قطعة
              </span>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
