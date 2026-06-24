import { useCallback, useEffect, useState } from 'react';
import { ChefHat, Check, Flame } from 'lucide-react';
import { restaurantApi } from '../../lib/api';
import type { KdsOrder } from '../../lib/types';
import { Button, EmptyState, PageHeader, Spinner, useToast } from '../../components/ui';

/** Kitchen Display — live orders; refreshes every 10s. token=null for owner/manager, set for kitchen staff. */
export default function RestaurantKds({ token = null }: { token?: string | null }) {
  const [orders, setOrders] = useState<KdsOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setOrders(await restaurantApi.kdsList(token));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  async function setStatus(id: string, status: 'preparing' | 'ready' | 'served') {
    try {
      await restaurantApi.kdsSetStatus(id, status, token);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (loading) return <Spinner label="جارٍ التحميل..." />;

  return (
    <div>
      <PageHeader
        title="شاشة المطبخ"
        subtitle="الطلبات الواردة — حدّث الحالة عند التحضير والتجهيز"
        icon={<ChefHat size={22} />}
      />
      {orders.length === 0 ? (
        <EmptyState message="لا طلبات قيد التحضير حاليًا." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {orders.map((o) => (
            <div
              key={o.id}
              className={`ax-card flex flex-col p-4 ${
                o.status === 'ready' ? 'border-success/50' : o.status === 'preparing' ? 'border-warning/50' : ''
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-lg font-extrabold text-text">طاولة {o.table_label}</span>
                <span className="font-mono text-[11px] text-muted">{o.order_no}</span>
              </div>
              <ul className="mb-3 flex-1 space-y-1.5">
                {o.items.map((it, i) => (
                  <li key={i} className="text-sm text-text">
                    <span className="font-bold text-gold">{it.qty}×</span> {it.name}
                    {it.options?.length > 0 && (
                      <span className="text-[11px] text-muted"> ({it.options.map((x) => x.name).join('، ')})</span>
                    )}
                    {it.note && <span className="block text-[11px] text-warning">— {it.note}</span>}
                  </li>
                ))}
              </ul>
              {o.note && <p className="mb-2 text-[11px] text-warning">ملاحظة: {o.note}</p>}
              <div className="flex gap-2">
                {o.status === 'new' && (
                  <Button size="sm" variant="outline" className="flex-1" icon={<Flame size={14} />} onClick={() => setStatus(o.id, 'preparing')}>
                    بدء التحضير
                  </Button>
                )}
                {o.status === 'preparing' && (
                  <Button size="sm" variant="success" className="flex-1" icon={<Check size={14} />} onClick={() => setStatus(o.id, 'ready')}>
                    جاهز
                  </Button>
                )}
                {o.status === 'ready' && (
                  <Button size="sm" variant="ghost" className="flex-1" onClick={() => setStatus(o.id, 'served')}>
                    تم التقديم
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
