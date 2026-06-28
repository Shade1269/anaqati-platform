import { useEffect, useState } from 'react';
import { LayoutDashboard, Wallet, Receipt, PackageX, CalendarClock, Boxes } from 'lucide-react';
import { adminApi } from '../../lib/api';
import type { GroceryDashboard as GD } from '../../lib/types';
import {
  EmptyState,
  PageHeader,
  Spinner,
  StatCard,
  Table,
} from '../../components/ui';
import { sar } from '../../lib/format';

export default function GroceryDashboard() {
  const [data, setData] = useState<GD | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi
      .groceryDashboard()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="لوحة البقالة"
        subtitle="نظرة سريعة على مبيعات اليوم وحالة المخزون"
        icon={<LayoutDashboard size={22} />}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="مبيعات اليوم" value={sar(data?.sales_today ?? 0)} icon={<Wallet size={20} />} tone="gold" />
        <StatCard label="عدد الفواتير اليوم" value={data?.tx_today ?? 0} icon={<Receipt size={20} />} tone="info" />
        <StatCard label="أصناف تحت النقطة" value={data?.low_stock ?? 0} icon={<PackageX size={20} />} tone={data && data.low_stock > 0 ? 'danger' : 'success'} />
        <StatCard label="دفعات قرب الانتهاء" value={data?.expiring ?? 0} icon={<CalendarClock size={20} />} tone={data && data.expiring > 0 ? 'warning' : 'success'} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="إجمالي الأصناف" value={data?.products ?? 0} icon={<Boxes size={20} />} tone="info" />
      </div>

      <h3 className="mb-3 text-sm font-bold text-muted">أعلى الأصناف مبيعًا هذا الشهر</h3>
      {!data || data.top_products.length === 0 ? (
        <EmptyState message="لا مبيعات بعد هذا الشهر" icon={<Receipt size={26} />} />
      ) : (
        <Table
          head={
            <>
              <th>الصنف</th>
              <th>الكمية المباعة</th>
              <th>الإيراد</th>
            </>
          }
        >
          {data.top_products.map((p, i) => (
            <tr key={i}>
              <td className="font-semibold">{p.name}</td>
              <td className="text-muted">{p.qty}</td>
              <td className="text-gold">{sar(p.revenue)}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
