import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, TrendingUp, Target, Wallet, Package } from 'lucide-react';
import { employeeApi } from '../../lib/api';
import { useEmployeeAuth } from '../../context/EmployeeAuthContext';
import { useCurrentBranch } from '../../context/useCurrentBranch';
import type { EmployeeDashboard as Dash } from '../../lib/types';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorBanner,
  PageHeader,
  ProgressBar,
  Spinner,
  StatCard,
  Table,
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

  const target = data?.branch_target;

  return (
    <div>
      <PageHeader
        title="لوحة التحكم"
        subtitle="ملخص يومك الحالي في المعرض"
        icon={<TrendingUp size={22} />}
        action={
          <Button variant="ghost" icon={<RefreshCw size={16} />} onClick={load}>
            تحديث
          </Button>
        }
      />

      <ErrorBanner message={error} />

      {loading && <Spinner />}

      {!loading && data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="مبيعات اليوم"
              value={sar(data.sales_today)}
              icon={<Wallet size={20} />}
              tone="success"
            />
            {target && (
              <>
                <StatCard
                  label="هدف المعرض"
                  value={sar(target.target)}
                  icon={<Target size={20} />}
                  tone="info"
                />
                <StatCard
                  label="المُحقَّق"
                  value={sar(target.achieved)}
                  icon={<TrendingUp size={20} />}
                  tone="gold"
                />
              </>
            )}
          </div>

          {target && (
            <Card>
              <CardHeader title="التقدّم نحو الهدف" icon={<Target size={18} />} />
              <ProgressBar value={target.achieved} max={target.target} />
            </Card>
          )}

          <div>
            <CardHeader title="العُهدة الحالية" icon={<Package size={18} />} />
            {data.consignment.length === 0 ? (
              <EmptyState message="لا توجد بضاعة في عُهدتك" icon={<Package size={26} />} />
            ) : (
              <Table
                head={
                  <>
                    <th>المنتج</th>
                    <th>الكود</th>
                    <th>الكمية</th>
                  </>
                }
              >
                {data.consignment.map((c) => (
                  <tr key={c.product_id}>
                    <td>{c.name}</td>
                    <td className="text-muted">{c.code}</td>
                    <td className="font-bold text-gold">{c.qty}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
