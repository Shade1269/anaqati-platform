import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Plus, PackageCheck, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import type {
  PurchaseOrder,
  PurchaseOrderDetail,
  PurchaseOrderItem,
  ProductPublic,
  Supplier,
  Warehouse,
} from '../../lib/types';
import ProductLinePicker, {
  type Line,
  type LineProduct,
  type UnitOption,
} from '../../components/ProductLinePicker';
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
import { sar } from '../../lib/format';

const statusMeta: Record<
  PurchaseOrder['status'],
  { label: string; tone: 'info' | 'warning' | 'success' | 'neutral' | 'danger' }
> = {
  draft: { label: 'مسودة', tone: 'neutral' },
  sent: { label: 'مُرسَل', tone: 'info' },
  partial: { label: 'مستلَم جزئيًا', tone: 'warning' },
  received: { label: 'مكتمل', tone: 'success' },
  cancelled: { label: 'ملغى', tone: 'danger' },
};

export default function AdminPurchaseOrders() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [receiveFor, setReceiveFor] = useState<PurchaseOrder | null>(null);
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      setOrders(await adminApi.poList());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cancel(po: PurchaseOrder) {
    try {
      await adminApi.poCancel(po.id);
      toast.success('تم إلغاء أمر الشراء');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="أوامر الشراء"
        subtitle="طلب البضاعة من الموردين واستلامها (PO / GRN)"
        icon={<ClipboardList size={22} />}
        action={
          <Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>
            أمر شراء جديد
          </Button>
        }
      />

      {loading ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <EmptyState message="لا توجد أوامر شراء" icon={<ClipboardList size={26} />} />
      ) : (
        <Table
          head={
            <>
              <th>المورد</th>
              <th>المستودع</th>
              <th>البنود</th>
              <th>الإجمالي</th>
              <th>الحالة</th>
              <th></th>
            </>
          }
        >
          {orders.map((po) => {
            const sm = statusMeta[po.status];
            const open = po.status === 'sent' || po.status === 'partial';
            return (
              <tr key={po.id}>
                <td className="font-semibold">{po.supplier_name || '—'}</td>
                <td className="text-muted">{po.warehouse_name || '—'}</td>
                <td className="text-muted">{po.items_count}</td>
                <td className="text-gold">{sar(po.total_sar)}</td>
                <td>
                  <Badge tone={sm.tone}>{sm.label}</Badge>
                </td>
                <td>
                  <div className="flex flex-wrap gap-1.5">
                    {open && (
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<PackageCheck size={14} />}
                        onClick={() => setReceiveFor(po)}
                      >
                        استلام
                      </Button>
                    )}
                    {open && (
                      <Button
                        size="sm"
                        variant="danger"
                        icon={<XCircle size={14} />}
                        onClick={() => cancel(po)}
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
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      )}
      {receiveFor && (
        <ReceiveDialog
          po={receiveFor}
          onClose={() => setReceiveFor(null)}
          onDone={() => {
            setReceiveFor(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CreateDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [products, setProducts] = useState<ProductPublic[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [unitsByProduct, setUnitsByProduct] = useState<Record<string, UnitOption[]>>(
    {}
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase
        .from('products_public')
        .select('id,product_code,name,category_id,sale_price_ref,is_active')
        .order('name'),
      supabase.from('warehouses').select('id,name,location,is_active').order('name'),
      supabase.from('suppliers').select('id,name,phone,notes').order('name'),
    ]).then(([p, w, s]) => {
      setProducts((p.data as ProductPublic[]) || []);
      setWarehouses((w.data as Warehouse[]) || []);
      setSuppliers((s.data as Supplier[]) || []);
    });
  }, []);

  const lineProducts: LineProduct[] = useMemo(
    () =>
      products.map((p) => ({
        id: p.id,
        code: p.product_code,
        name: p.name,
        price_ref: p.sale_price_ref,
      })),
    [products]
  );

  function handleLines(next: Line[]) {
    setLines(next);
    next
      .map((l) => l.product_id)
      .filter((id) => !(id in unitsByProduct))
      .forEach((id) => {
        setUnitsByProduct((m) => ({ ...m, [id]: m[id] ?? [] }));
        adminApi
          .uomList(id)
          .then((res) => {
            const opts: UnitOption[] = [
              { id: null, label: res.base_unit, factor: 1 },
              ...res.units.map((u) => ({ id: u.id, label: u.unit_name, factor: u.factor })),
            ];
            setUnitsByProduct((m) => ({ ...m, [id]: opts }));
          })
          .catch(() => {});
      });
  }

  const total = useMemo(
    () => lines.reduce((s, l) => s + (l.unit_price ?? 0) * l.qty, 0),
    [lines]
  );

  async function submit() {
    if (!warehouseId) return toast.error('اختر المستودع');
    if (lines.length === 0) return toast.error('أضف منتجًا واحدًا على الأقل');
    setBusy(true);
    try {
      await adminApi.poCreate(
        supplierId || null,
        warehouseId,
        notes.trim() || null,
        lines.map((l) => ({
          product_id: l.product_id,
          qty: l.qty,
          unit_cost: l.unit_price ?? 0,
          uom_id: l.uom_id ?? null,
        }))
      );
      toast.success('تم إنشاء أمر الشراء');
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="أمر شراء جديد" size="lg">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="المورد">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
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
        </div>

        <ProductLinePicker
          products={lineProducts}
          lines={lines}
          onChange={handleLines}
          withPrice
          withUom
          unitsByProduct={unitsByProduct}
        />
        <p className="text-xs text-muted">«سعر الوحدة» هنا = تكلفة الشراء لكل وحدة.</p>

        <div className="flex items-center justify-between border-t border-white/10 pt-4">
          <span className="text-lg font-bold text-text">
            الإجمالي: <span className="text-gold">{sar(total)}</span>
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              إلغاء
            </Button>
            <Button loading={busy} onClick={submit}>
              إنشاء الأمر
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

interface RecvRow {
  qty: string;
  batch_no: string;
  expiry: string;
}

function ReceiveDialog({
  po,
  onClose,
  onDone,
}: {
  po: PurchaseOrder;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [detail, setDetail] = useState<PurchaseOrderDetail | null>(null);
  const [rows, setRows] = useState<Record<string, RecvRow>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi
      .poGet(po.id)
      .then((d) => {
        setDetail(d);
        const init: Record<string, RecvRow> = {};
        d.items.forEach((it: PurchaseOrderItem) => {
          const remaining = it.qty_ordered - it.qty_received;
          init[it.id] = {
            qty: remaining > 0 ? String(remaining) : '0',
            batch_no: '',
            expiry: '',
          };
        });
        setRows(init);
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [po.id]);

  function upd(id: string, patch: Partial<RecvRow>) {
    setRows((m) => ({ ...m, [id]: { ...m[id], ...patch } }));
  }

  async function submit() {
    const items = Object.entries(rows)
      .map(([po_item_id, r]) => ({
        po_item_id,
        qty: Number(r.qty) || 0,
        batch_no: r.batch_no.trim() || undefined,
        expiry: r.expiry || undefined,
      }))
      .filter((i) => i.qty > 0);
    if (items.length === 0) return toast.error('أدخل كمية استلام واحدة على الأقل');
    setBusy(true);
    try {
      await adminApi.poReceive(po.id, items);
      toast.success('تم تسجيل الاستلام');
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="استلام بضاعة مقابل أمر شراء" size="lg">
      {loading || !detail ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <Card className="space-y-3">
            {detail.items.map((it) => {
              const remaining = it.qty_ordered - it.qty_received;
              return (
                <div
                  key={it.id}
                  className="rounded-lg border border-white/10 bg-bg-2 p-3"
                >
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-semibold text-text">
                      {it.product_name}{' '}
                      <span className="font-mono text-muted">({it.product_code})</span>
                    </span>
                    <span className="text-muted">
                      مطلوب {it.qty_ordered} {it.uom_name} — مستلَم {it.qty_received} —
                      متبقٍّ {remaining}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <Field label={`الكمية (${it.uom_name})`} className="w-28">
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={rows[it.id]?.qty ?? ''}
                        onChange={(e) => upd(it.id, { qty: e.target.value })}
                      />
                    </Field>
                    <Field label="رقم الدفعة" className="w-32">
                      <Input
                        value={rows[it.id]?.batch_no ?? ''}
                        onChange={(e) => upd(it.id, { batch_no: e.target.value })}
                        placeholder="—"
                      />
                    </Field>
                    <Field label="الصلاحية" className="w-40">
                      <Input
                        type="date"
                        value={rows[it.id]?.expiry ?? ''}
                        onChange={(e) => upd(it.id, { expiry: e.target.value })}
                      />
                    </Field>
                  </div>
                </div>
              );
            })}
          </Card>
          <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
            <Button variant="ghost" onClick={onClose}>
              إلغاء
            </Button>
            <Button loading={busy} onClick={submit}>
              تأكيد الاستلام
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
