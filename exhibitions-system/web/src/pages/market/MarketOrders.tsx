import { useCallback, useEffect, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { marketApi } from '../../lib/api';
import type { MarketOrderRow, MarketOrderDetail } from '../../lib/types';
import {
  Button,
  Dialog,
  EmptyState,
  PageHeader,
  Spinner,
  Table,
  useToast,
} from '../../components/ui';

const money = (n: number) => `${(n || 0).toFixed(2)} ر.س`;
const statusLabel: Record<string, string> = {
  new: 'جديد',
  confirmed: 'مؤكّد',
  fulfilled: 'منفّذ',
  cancelled: 'ملغى',
};

export default function MarketOrders() {
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [rows, setRows] = useState<MarketOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<MarketOrderDetail | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(tab === 'incoming' ? await marketApi.incoming() : await marketApi.outgoing());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tab, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: string, status: 'confirmed' | 'fulfilled' | 'cancelled') {
    try {
      await marketApi.setOrderStatus(id, status);
      toast.success('تم التحديث');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader title="طلبات السوق" subtitle="الطلبات الواردة لك والصادرة منك" icon={<ClipboardList size={22} />} />

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab('incoming')}
          className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === 'incoming' ? 'bg-primary text-black' : 'bg-surface-2 text-muted'}`}
        >
          واردة (مبيعاتي)
        </button>
        <button
          onClick={() => setTab('outgoing')}
          className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === 'outgoing' ? 'bg-primary text-black' : 'bg-surface-2 text-muted'}`}
        >
          صادرة (مشترياتي)
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState message="لا طلبات." />
      ) : (
        <Table
          head={
            <>
              <th>الرقم</th>
              <th>{tab === 'incoming' ? 'المشتري' : 'المورّد'}</th>
              <th>القيمة</th>
              <th>الدفع</th>
              <th>الحالة</th>
              <th></th>
            </>
          }
        >
          {rows.map((o) => (
            <tr key={o.id}>
              <td className="font-mono text-xs">{o.order_no}</td>
              <td className="font-semibold">{o.counterparty}</td>
              <td className="text-gold">{money(o.total)}</td>
              <td className="text-muted">{o.payment_method === 'credit' ? 'آجل' : 'نقد'}</td>
              <td>{statusLabel[o.status] || o.status}</td>
              <td>
                <div className="flex items-center justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={async () => setDetail(await marketApi.orderDetail(o.id))}>
                    تفاصيل
                  </Button>
                  {tab === 'incoming' && o.status === 'new' && (
                    <Button size="sm" variant="outline" onClick={() => act(o.id, 'confirmed')}>
                      تأكيد
                    </Button>
                  )}
                  {tab === 'incoming' && (o.status === 'new' || o.status === 'confirmed') && (
                    <Button size="sm" onClick={() => act(o.id, 'fulfilled')}>
                      تنفيذ
                    </Button>
                  )}
                  {tab === 'incoming' && (o.status === 'new' || o.status === 'confirmed') && (
                    <Button size="sm" variant="danger" onClick={() => act(o.id, 'cancelled')}>
                      إلغاء
                    </Button>
                  )}
                  {tab === 'outgoing' && o.status === 'new' && (
                    <Button size="sm" variant="danger" onClick={() => act(o.id, 'cancelled')}>
                      إلغاء
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Dialog open={!!detail} onClose={() => setDetail(null)} title={detail ? `طلب ${detail.order_no}` : ''}>
        {detail && (
          <div className="space-y-2">
            {detail.items.map((it, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span>
                  {it.qty} {it.unit || ''} × {it.name}
                </span>
                <span className="text-gold">{money(it.line_total)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-white/10 pt-2 font-bold">
              <span>الإجمالي</span>
              <span className="text-gold">{money(detail.total)}</span>
            </div>
            {detail.note && <p className="text-xs text-muted">ملاحظة: {detail.note}</p>}
          </div>
        )}
      </Dialog>
    </div>
  );
}
