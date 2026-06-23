import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, ShoppingCart, TrendingUp, Truck } from 'lucide-react';
import { adminStoreApi } from '../../../lib/api';
import type {
  OnlineOrder,
  OnlineOrderItem,
  OnlineOrderStatus,
} from '../../../lib/types';
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorBanner,
  Field,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  Table,
  useToast,
} from '../../../components/ui';
import { sar, fmtDateTime } from '../../../lib/format';

const statusMeta: Record<
  OnlineOrderStatus,
  { label: string; tone: 'info' | 'gold' | 'success' | 'danger' }
> = {
  new: { label: 'جديد', tone: 'info' },
  confirmed: { label: 'مؤكد', tone: 'gold' },
  fulfilled: { label: 'منفّذ', tone: 'success' },
  cancelled: { label: 'ملغى', tone: 'danger' },
};

function OrderStatusBadge({ status }: { status: OnlineOrderStatus }) {
  const m = statusMeta[status] || { label: status, tone: 'info' as const };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default function AdminStoreOrders() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>(
    []
  );

  // detail dialog
  const [selected, setSelected] = useState<OnlineOrder | null>(null);
  const [items, setItems] = useState<OnlineOrderItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [acting, setActing] = useState(false);

  // fulfill dialog
  const [fulfillOrder, setFulfillOrder] = useState<OnlineOrder | null>(null);
  const [warehouseId, setWarehouseId] = useState('');
  const [fulfilling, setFulfilling] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [o, w] = await Promise.all([
        adminStoreApi.listOrders(),
        adminStoreApi.listWarehouses(),
      ]);
      setOrders(o);
      setWarehouses(w);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function openOrder(o: OnlineOrder) {
    setSelected(o);
    setItems([]);
    setItemsLoading(true);
    try {
      const list = await adminStoreApi.getOrderItems(o.id);
      setItems(list);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setItemsLoading(false);
    }
  }

  async function changeStatus(
    o: OnlineOrder,
    status: 'confirmed' | 'cancelled'
  ) {
    setActing(true);
    try {
      await adminStoreApi.setOrderStatus(o.id, status);
      toast.success(status === 'confirmed' ? 'تم تأكيد الطلب' : 'تم إلغاء الطلب');
      setSelected(null);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setActing(false);
    }
  }

  async function doFulfill(e: React.FormEvent) {
    e.preventDefault();
    if (!fulfillOrder || !warehouseId) return;
    setFulfilling(true);
    try {
      const res = await adminStoreApi.fulfillOrder(fulfillOrder.id, warehouseId);
      toast.success(`تم تنفيذ الطلب — الإيراد ${sar(res.revenue)}`);
      setFulfillOrder(null);
      setSelected(null);
      setWarehouseId('');
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setFulfilling(false);
    }
  }

  const newCount = useMemo(
    () => orders.filter((o) => o.status === 'new').length,
    [orders]
  );
  const todaySales = useMemo(
    () =>
      orders
        .filter((o) => o.status === 'fulfilled' && isToday(o.created_at))
        .reduce((s, o) => s + (o.total_sar || 0), 0),
    [orders]
  );

  return (
    <div>
      <PageHeader
        title="طلبات المتجر"
        subtitle="إدارة الطلبات الواردة من المتجر الإلكتروني"
        icon={<ClipboardList size={22} />}
      />

      <ErrorBanner message={error} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard
          label="طلبات جديدة"
          value={newCount}
          icon={<ShoppingCart size={20} />}
          tone="info"
        />
        <StatCard
          label="مبيعات اليوم (منفّذة)"
          value={sar(todaySales)}
          icon={<TrendingUp size={20} />}
          tone="success"
        />
      </div>

      {loading ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <EmptyState message="لا توجد طلبات بعد" icon={<ClipboardList size={26} />} />
      ) : (
        <Table
          head={
            <>
              <th>رقم الطلب</th>
              <th>العميل</th>
              <th>الجوال</th>
              <th>الإجمالي</th>
              <th>الحالة</th>
              <th>التاريخ</th>
            </>
          }
        >
          {orders.map((o) => (
            <tr
              key={o.id}
              className="cursor-pointer"
              onClick={() => openOrder(o)}
            >
              <td className="font-mono font-semibold text-gold">
                {o.order_no}
              </td>
              <td className="font-semibold">{o.customer_name || '—'}</td>
              <td className="text-muted" dir="ltr">
                {o.customer_phone || '—'}
              </td>
              <td>{sar(o.total_sar || 0)}</td>
              <td>
                <OrderStatusBadge status={o.status} />
              </td>
              <td className="text-muted">{fmtDateTime(o.created_at)}</td>
            </tr>
          ))}
        </Table>
      )}

      {/* Order detail dialog */}
      <Dialog
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `الطلب ${selected.order_no}` : ''}
        footer={
          selected ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <OrderStatusBadge status={selected.status} />
              <div className="flex gap-2">
                {selected.status === 'new' && (
                  <>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={acting}
                      onClick={() => changeStatus(selected, 'cancelled')}
                    >
                      إلغاء
                    </Button>
                    <Button
                      variant="success"
                      size="sm"
                      loading={acting}
                      onClick={() => changeStatus(selected, 'confirmed')}
                    >
                      تأكيد
                    </Button>
                  </>
                )}
                {(selected.status === 'new' ||
                  selected.status === 'confirmed') && (
                  <Button
                    size="sm"
                    icon={<Truck size={14} />}
                    onClick={() => {
                      setFulfillOrder(selected);
                      setWarehouseId(warehouses[0]?.id || '');
                    }}
                  >
                    تنفيذ الطلب
                  </Button>
                )}
              </div>
            </div>
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted">العميل</p>
                <p className="font-semibold text-text">
                  {selected.customer_name || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">الجوال</p>
                <p className="font-semibold text-text" dir="ltr">
                  {selected.customer_phone || '—'}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted">العنوان</p>
                <p className="font-semibold text-text">
                  {selected.address || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">طريقة الدفع</p>
                <p className="font-semibold text-text">
                  {selected.payment_method === 'cash'
                    ? 'نقد عند الاستلام'
                    : selected.payment_method === 'card'
                      ? 'شبكة'
                      : selected.payment_method || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">التاريخ</p>
                <p className="font-semibold text-text">
                  {fmtDateTime(selected.created_at)}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold text-muted">الأصناف</p>
              {itemsLoading ? (
                <Spinner />
              ) : items.length === 0 ? (
                <p className="text-sm text-muted">لا توجد أصناف</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-white/10">
                  <table className="ax-table">
                    <thead>
                      <tr>
                        <th>الصنف</th>
                        <th>الكمية</th>
                        <th>السعر</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => (
                        <tr key={it.id}>
                          <td className="font-semibold">
                            {it.products?.name || '—'}
                          </td>
                          <td>{it.qty}</td>
                          <td>{sar(it.unit_price || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-white/10 pt-3 text-sm">
              <span className="text-muted">رسوم التوصيل</span>
              <span className="font-semibold">
                {sar(selected.delivery_fee || 0)}
              </span>
            </div>
            <div className="flex items-center justify-between text-base font-extrabold">
              <span>الإجمالي</span>
              <span className="text-gold">{sar(selected.total_sar || 0)}</span>
            </div>
          </div>
        )}
      </Dialog>

      {/* Fulfill dialog */}
      <Dialog
        open={!!fulfillOrder}
        onClose={() => setFulfillOrder(null)}
        title="تنفيذ الطلب"
        size="sm"
      >
        {fulfillOrder && (
          <form onSubmit={doFulfill} className="space-y-4">
            <p className="text-sm text-muted">
              سيتم خصم المخزون وترحيل القيود المحاسبية للطلب{' '}
              <span className="font-bold text-gold">
                {fulfillOrder.order_no}
              </span>
              .
            </p>
            <Field label="المستودع">
              <Select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                required
              >
                <option value="">اختر المستودع</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setFulfillOrder(null)}
              >
                إلغاء
              </Button>
              <Button type="submit" loading={fulfilling} disabled={!warehouseId}>
                تنفيذ
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
