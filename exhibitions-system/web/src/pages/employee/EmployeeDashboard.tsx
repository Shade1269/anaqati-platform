import { useCallback, useEffect, useState } from 'react';
import { employeeApi } from '../../lib/api';
import { useEmployeeAuth } from '../../context/EmployeeAuthContext';
import { useCurrentBranch } from '../../context/useCurrentBranch';
import type { EmployeeDashboard as Dash } from '../../lib/types';
import {
  Empty,
  ErrorBox,
  PageTitle,
  ProgressBar,
  Spinner,
  StatCard,
} from '../../components/ui';
import { sar } from '../../lib/format';

export default function EmployeeDashboard() {
  const { session } = useEmployeeAuth();
  const branchId = useCurrentBranch();
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!session) return;
    setError('');
    setLoading(true);
    try {
      const d = await employeeApi.dashboard(session.token, branchId);
      setData(d);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session, branchId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageTitle
        title="لوحة التحكم"
        subtitle="ملخص يومك الحالي في المعرض"
        action={
          <button className="btn-ghost" onClick={load}>
            تحديث
          </button>
        }
      />

      <ErrorBox message={error} />

      {loading && <Spinner />}

      {!loading && data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="مبيعات اليوم"
              value={sar(data.sales_today)}
              tone="emerald"
            />
            {data.branch_target && (
              <>
                <StatCard
                  label="هدف المعرض"
                  value={sar(data.branch_target.target)}
                  tone="indigo"
                />
                <StatCard
                  label="المُحقَّق"
                  value={sar(data.branch_target.achieved)}
                  tone="amber"
                />
              </>
            )}
          </div>

          {data.branch_target && (
            <div className="card">
              <h2 className="mb-3 font-semibold text-slate-700">
                التقدّم نحو الهدف
              </h2>
              <ProgressBar
                value={data.branch_target.achieved}
                max={data.branch_target.target}
              />
            </div>
          )}

          <div className="card">
            <h2 className="mb-3 font-semibold text-slate-700">
              العُهدة الحالية
            </h2>
            {data.consignment.length === 0 ? (
              <Empty message="لا توجد بضاعة في عُهدتك" />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>المنتج</th>
                      <th>الكود</th>
                      <th>الكمية</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.consignment.map((c) => (
                      <tr key={c.product_id}>
                        <td>{c.name}</td>
                        <td>{c.code}</td>
                        <td className="font-semibold">{c.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
