import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import {
  Empty,
  ErrorBox,
  PageTitle,
  Spinner,
  SuccessBox,
} from '../../components/ui';

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
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  // editable approved quantities per request: { [requestId]: { [productId]: qty } }
  const [edits, setEdits] = useState<Record<string, Record<string, number>>>({});
  const [busyId, setBusyId] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    const { data, error: e } = await supabase
      .from('stock_requests')
      .select(
        'id,branch_id,status,created_at,branch:branches(name),items:stock_request_items(product_id,qty_requested,qty_approved,product:products_public(name,product_code))'
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (e) {
      setError(e.message);
      setLoading(false);
      return;
    }
    const rows = (data as unknown as StockRequest[]) || [];
    setRequests(rows);
    const initial: Record<string, Record<string, number>> = {};
    rows.forEach((r) => {
      initial[r.id] = {};
      r.items.forEach((it) => {
        initial[r.id][it.product_id] =
          it.qty_approved ?? it.qty_requested;
      });
    });
    setEdits(initial);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function review(r: StockRequest, action: 'approve' | 'reject') {
    setBusyId(r.id);
    setError('');
    setSuccess('');
    try {
      const approvals = r.items.map((it) => ({
        product_id: it.product_id,
        qty_approved:
          action === 'approve' ? edits[r.id]?.[it.product_id] ?? 0 : 0,
      }));
      await adminApi.reviewStockRequest(r.id, action, approvals);
      setSuccess(action === 'approve' ? 'تمت الموافقة على الطلب' : 'تم رفض الطلب');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId('');
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageTitle title="طلبات البضاعة" subtitle="مراجعة الطلبات المعلّقة" />
      <ErrorBox message={error} />
      <SuccessBox message={success} />

      {requests.length === 0 ? (
        <Empty message="لا توجد طلبات معلّقة" />
      ) : (
        <div className="space-y-4">
          {requests.map((r) => (
            <div key={r.id} className="card">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-bold text-slate-800">
                  معرض: {r.branch?.name || r.branch_id}
                </span>
                <span className="text-xs text-slate-400">
                  {new Date(r.created_at).toLocaleString('ar')}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="table-base">
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
                            <span className="text-slate-400">
                              ({it.product.product_code})
                            </span>
                          )}
                        </td>
                        <td>{it.qty_requested}</td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            className="input w-24"
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
                <button
                  className="btn-emerald"
                  onClick={() => review(r, 'approve')}
                  disabled={busyId === r.id}
                >
                  موافقة
                </button>
                <button
                  className="btn-danger"
                  onClick={() => review(r, 'reject')}
                  disabled={busyId === r.id}
                >
                  رفض
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
