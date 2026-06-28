import { useEffect, useState } from 'react';
import { ClipboardCheck, Plus, CheckCircle2, XCircle, Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import type {
  StockCount,
  StockCountDetail,
  StockCountItem,
  Warehouse,
} from '../../lib/types';
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Table,
  useToast,
} from '../../components/ui';

const statusMeta: Record<
  StockCount['status'],
  { label: string; tone: 'info' | 'success' | 'danger' }
> = {
  open: { label: 'مفتوح', tone: 'info' },
  closed: { label: 'مغلق', tone: 'success' },
  cancelled: { label: 'ملغى', tone: 'danger' },
};

export default function AdminStockCount() {
  const [counts, setCounts] = useState<StockCount[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      setCounts(await adminApi.countList());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    supabase
      .from('warehouses')
      .select('id,name,location,is_active')
      .order('name')
      .then(({ data }) => setWarehouses((data as Warehouse[]) || []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cancel(c: StockCount) {
    try {
      await adminApi.countCancel(c.id);
      toast.success('تم الإلغاء');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="الجرد الدوري"
        subtitle="جرد المخزون وتسوية الفروقات تلقائيًا"
        icon={<ClipboardCheck size={22} />}
        action={
          <Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>
            جرد جديد
          </Button>
        }
      />

      {loading ? (
        <Spinner />
      ) : counts.length === 0 ? (
        <EmptyState message="لا توجد عمليات جرد" icon={<ClipboardCheck size={26} />} />
      ) : (
        <Table
          head={
            <>
              <th>الموقع</th>
              <th>البنود</th>
              <th>الحالة</th>
              <th>التاريخ</th>
              <th></th>
            </>
          }
        >
          {counts.map((c) => {
            const sm = statusMeta[c.status];
            return (
              <tr key={c.id}>
                <td className="font-semibold">{c.location_name || '—'}</td>
                <td className="text-muted">{c.items_count}</td>
                <td>
                  <Badge tone={sm.tone}>{sm.label}</Badge>
                </td>
                <td className="text-muted">
                  {new Date(c.created_at).toLocaleDateString('ar')}
                </td>
                <td>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Pencil size={14} />}
                      onClick={() => setOpenId(c.id)}
                    >
                      {c.status === 'open' ? 'إدخال الجرد' : 'عرض'}
                    </Button>
                    {c.status === 'open' && (
                      <Button
                        size="sm"
                        variant="danger"
                        icon={<XCircle size={14} />}
                        onClick={() => cancel(c)}
                      >
                        إلغاء
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      )}

      {creating && (
        <CreateDialog
          warehouses={warehouses}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            load();
            setOpenId(id);
          }}
        />
      )}
      {openId && (
        <CountDialog
          countId={openId}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function CreateDialog({
  warehouses,
  onClose,
  onCreated,
}: {
  warehouses: Warehouse[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const toast = useToast();
  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!warehouseId) return toast.error('اختر المستودع');
    setBusy(true);
    try {
      const id = await adminApi.countCreate('warehouse', warehouseId, notes.trim() || null);
      toast.success('تم إنشاء الجرد');
      onCreated(id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="جرد جديد" size="sm">
      <div className="space-y-4">
        <Field label="المستودع">
          <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">—</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ملاحظات">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <p className="text-xs text-muted">
          سيُلتقط جميع أصناف المستودع بكمياتها الحالية لتعديلها أثناء الجرد.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button loading={busy} onClick={submit}>
            إنشاء
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function CountDialog({
  countId,
  onClose,
  onChanged,
}: {
  countId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [detail, setDetail] = useState<StockCountDetail | null>(null);
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const d = await adminApi.countGet(countId);
    setDetail(d);
    const map: Record<string, string> = {};
    d.items.forEach((it: StockCountItem) => {
      map[it.product_id] = it.counted_qty != null ? String(it.counted_qty) : '';
    });
    setCounted(map);
  }

  useEffect(() => {
    reload()
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countId]);

  const isOpen = detail?.count.status === 'open';

  async function saveItem(productId: string) {
    const v = Number(counted[productId]);
    if (!(v >= 0)) return;
    try {
      await adminApi.countSetItem(countId, productId, v);
      toast.success('حُفظت الكمية');
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function close() {
    setBusy(true);
    try {
      const res = await adminApi.countClose(countId);
      toast.success(`تم إغلاق الجرد — ${res.adjustments} تسوية`);
      onChanged();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={isOpen ? 'إدخال الجرد' : 'تفاصيل الجرد'}
      size="lg"
    >
      {loading || !detail ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <Card>
            <Table
              head={
                <>
                  <th>المنتج</th>
                  <th>النظام</th>
                  <th>المعدود</th>
                  <th>الفرق</th>
                </>
              }
            >
              {detail.items.map((it) => {
                const cur = counted[it.product_id] ?? '';
                const variance =
                  cur !== '' ? Number(cur) - it.system_qty : it.variance;
                return (
                  <tr key={it.id}>
                    <td className="font-semibold">
                      {it.product_name}{' '}
                      <span className="font-mono text-muted">({it.product_code})</span>
                    </td>
                    <td className="text-muted">
                      {it.system_qty} {it.base_unit}
                    </td>
                    <td>
                      {isOpen ? (
                        <input
                          type="number"
                          step="any"
                          className="ax-input w-24"
                          value={cur}
                          onChange={(e) =>
                            setCounted((m) => ({ ...m, [it.product_id]: e.target.value }))
                          }
                          onBlur={() => cur !== '' && saveItem(it.product_id)}
                        />
                      ) : (
                        <span>{it.counted_qty ?? '—'}</span>
                      )}
                    </td>
                    <td
                      className={`font-bold ${
                        variance === 0
                          ? 'text-muted'
                          : variance > 0
                          ? 'text-success'
                          : 'text-danger'
                      }`}
                    >
                      {variance > 0 ? `+${variance}` : variance}
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Card>
          <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
            <Button variant="ghost" onClick={onClose}>
              إغلاق النافذة
            </Button>
            {isOpen && (
              <Button
                variant="success"
                icon={<CheckCircle2 size={16} />}
                loading={busy}
                onClick={close}
              >
                اعتماد الجرد وتسوية الفروقات
              </Button>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
