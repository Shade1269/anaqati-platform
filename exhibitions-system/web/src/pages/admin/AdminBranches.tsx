import { useEffect, useState } from 'react';
import { Store, Plus, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import type { Branch, ProductPublic, Warehouse } from '../../lib/types';
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

interface BranchInvRow {
  product_id: string;
  quantity: number;
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
  const [closingId, setClosingId] = useState('');
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

  async function closeBranch(id: string) {
    setClosingId(id);
    try {
      await adminApi.closeBranch(id);
      toast.success('تم إغلاق المعرض');
      setConfirmBranch(null);
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setClosingId('');
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
                    loading={closingId === b.id}
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
          busy={closingId === confirmBranch.id}
          onCancel={() => setConfirmBranch(null)}
          onConfirm={() => closeBranch(confirmBranch.id)}
        />
      )}
    </div>
  );
}

function CloseBranchDialog({
  branch,
  busy,
  onCancel,
  onConfirm,
}: {
  branch: Branch;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [rows, setRows] = useState<BranchInvRow[]>([]);
  const [products, setProducts] = useState<Record<string, ProductPublic>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase
        .from('inventory')
        .select('product_id,quantity')
        .eq('location_type', 'branch')
        .eq('location_id', branch.id)
        .gt('quantity', 0),
      supabase
        .from('products_public')
        .select('id,product_code,name,category_id,sale_price_ref,is_active'),
    ]).then(([inv, p]) => {
      setRows((inv.data as BranchInvRow[]) || []);
      const map: Record<string, ProductPublic> = {};
      ((p.data as ProductPublic[]) || []).forEach((x) => (map[x.id] = x));
      setProducts(map);
      setLoading(false);
    });
  }, [branch.id]);

  return (
    <Dialog
      open
      onClose={onCancel}
      title={`إغلاق المعرض — ${branch.name}`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            إلغاء
          </Button>
          <Button variant="danger" loading={busy} onClick={onConfirm}>
            تأكيد الإغلاق
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/8 px-4 py-3 text-sm text-warning">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>
            سيتم إرجاع البضاعة المتبقية في هذا المعرض إلى المستودع ثم إغلاق
            المعرض نهائيًا.
          </span>
        </div>

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState message="لا توجد بضاعة متبقية في المعرض" />
        ) : (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
              البضاعة التي ستُرجع للمستودع
            </p>
            <Table
              head={
                <>
                  <th>المنتج</th>
                  <th>الرمز</th>
                  <th>الكمية</th>
                </>
              }
            >
              {rows.map((r) => (
                <tr key={r.product_id}>
                  <td className="font-semibold">
                    {products[r.product_id]?.name || r.product_id}
                  </td>
                  <td className="text-muted">
                    {products[r.product_id]?.product_code || '—'}
                  </td>
                  <td className="text-gold">{r.quantity}</td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </div>
    </Dialog>
  );
}
