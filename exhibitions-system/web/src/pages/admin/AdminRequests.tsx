import { useEffect, useState } from 'react';
import { ClipboardList, Check, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Spinner,
  useToast,
} from '../../components/ui';
import { fmtDateTime } from '../../lib/format';

interface RequestItem {
  product_id: string;
  qty_requested: number;
  qty_approved: number | null;
  product?: { name: string; product_code: string } | null;
}

interface StockRequest {
  id: string;
  branch_id: string;
  status: string;
  created_at: string;
  branch?: { name: string } | null;
  items: RequestItem[];
}

export default function AdminRequests() {
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, Record<string, number>>>({});
  const [busyId, setBusyId] = useState('');
  const toast = useToast();

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('stock_requests')
      .select(
        'id,branch_id,status,created_at,branch:branches(name),items:stock_request_items(product_id,qty_requested,qty_approved,product:products_public(name,product_code))'
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const rows = (data as unknown as StockRequest[]) || [];
    setRequests(rows);
    const initial: Record<string, Record<string, number>> = {};
    rows.forEach((r) => {
      initial[r.id] = {};
      r.items.forEach((it) => {
        initial[r.id][it.product_id] = it.qty_approved ?? it.qty_requested;
      });
    });
    setEdits(initial);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function review(r: StockRequest, action: 'approve' | 'reject') {
    setBusyId(r.id + action);
    try {
      const approvals = r.items.map((it) => ({
        product_id: it.product_id,
        qty_approved: action === 'approve' ? edits[r.id]?.[it.product_id] ?? 0 : 0,
      }));
      await adminApi.reviewStockRequest(r.id, action, approvals);
      toast.success(action === 'approve' ? 'تمت الموافقة على الطلب' : 'تم رفض الطلب');
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId('');
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="طلبات البضاعة"
        subtitle="مراجعة الطلبات المعلّقة"
        icon={<ClipboardList size={22} />}
      />

      {requests.length === 0 ? (
        <EmptyState message="لا توجد طلبات معلّقة" icon={<ClipboardList size={26} />} />
      ) : (
        <div className="space-y-4">
          {requests.map((r) => (
            <Card key={r.id}>
              <div className="mb-3 flex items-center justify-between">
                <span className="font-bold text-text">
                  معرض: {r.branch?.name || r.branch_id}
                </span>
                <span className="text-xs text-muted">
                  {fmtDateTime(r.created_at)}
                </span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="ax-table">
                  <thead>
                    <tr>
                      <th>المنتج</th>
                      <th>المطلوب</th>
                      <th>الموافَق عليه</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.items.map((it) => (
                      <tr key={it.product_id}>
                        <td>
                          {it.product?.name || it.product_id}{' '}
                          {it.product?.product_code && (
                            <span className="text-muted">
                              ({it.product.product_code})
                            </span>
                          )}
                        </td>
                        <td>{it.qty_requested}</td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            className="ax-input w-24"
                            value={edits[r.id]?.[it.product_id] ?? 0}
                            onChange={(e) =>
                              setEdits((prev) => ({
                                ...prev,
                                [r.id]: {
                                  ...prev[r.id],
                                  [it.product_id]: Math.max(
                                    0,
                                    Number(e.target.value) || 0
                                  ),
                                },
                              }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="success"
                  icon={<Check size={16} />}
                  loading={busyId === r.id + 'approve'}
                  onClick={() => review(r, 'approve')}
                >
                  موافقة
                </Button>
                <Button
                  variant="danger"
                  icon={<X size={16} />}
                  loading={busyId === r.id + 'reject'}
                  onClick={() => review(r, 'reject')}
                >
                  رفض
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
