import { useEffect, useMemo, useState } from 'react';
import { Boxes, Search, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import type { ExpiringBatch, ProductPublic } from '../../lib/types';
import {
  EmptyState,
  ErrorBanner,
  Input,
  PageHeader,
  Spinner,
  Table,
  Badge,
} from '../../components/ui';

interface InventoryRow {
  product_id: string;
  location_type: string;
  location_id: string;
  quantity: number;
}

const locTypeLabel: Record<string, { label: string; tone: 'info' | 'gold' | 'success' }> =
  {
    warehouse: { label: 'مستودع', tone: 'info' },
    branch: { label: 'معرض', tone: 'gold' },
    employee_consignment: { label: 'عُهدة موظف', tone: 'success' },
  };

export default function AdminInventory() {
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [products, setProducts] = useState<ProductPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [expiring, setExpiring] = useState<ExpiringBatch[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from('inventory').select('product_id,location_type,location_id,quantity'),
      supabase
        .from('products_public')
        .select('id,product_code,name,category_id,sale_price_ref,is_active'),
    ]).then(([inv, p]) => {
      if (inv.error) setError(inv.error.message);
      setInventory((inv.data as InventoryRow[]) || []);
      setProducts((p.data as ProductPublic[]) || []);
      setLoading(false);
    });
    // دفعات قريبة الانتهاء (خلال 60 يومًا) — تفشل بصمت إن لم تتوفّر الصلاحية.
    adminApi
      .expiringBatches(60)
      .then(setExpiring)
      .catch(() => setExpiring([]));
  }, []);

  const byId = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products]
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inventory.filter((r) => {
      if (!q) return true;
      const p = byId[r.product_id];
      return (
        p?.name.toLowerCase().includes(q) ||
        p?.product_code.toLowerCase().includes(q)
      );
    });
  }, [inventory, byId, search]);

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="المخزون"
        subtitle="الكميات حسب الموقع (بدون تكلفة)"
        icon={<Boxes size={22} />}
      />
      <ErrorBanner message={error} />

      {expiring.length > 0 && (
        <div className="mb-5 rounded-xl border border-warning/30 bg-warning/5 p-4">
          <div className="mb-3 flex items-center gap-2 text-warning">
            <AlertTriangle size={18} />
            <span className="font-bold">
              دفعات منتهية أو قريبة الانتهاء ({expiring.length})
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="ax-table">
              <thead>
                <tr>
                  <th>المنتج</th>
                  <th>الدفعة</th>
                  <th>الصلاحية</th>
                  <th>المتبقّي (أيام)</th>
                  <th>الكمية</th>
                </tr>
              </thead>
              <tbody>
                {expiring.map((b) => (
                  <tr key={b.id}>
                    <td className="font-semibold">
                      {b.product_name}{' '}
                      <span className="font-mono text-muted">
                        ({b.product_code})
                      </span>
                    </td>
                    <td>{b.batch_no || '—'}</td>
                    <td>{b.expiry_date}</td>
                    <td>
                      <Badge tone={b.days_left < 0 ? 'danger' : 'warning'}>
                        {b.days_left < 0
                          ? `منتهية منذ ${Math.abs(b.days_left)}`
                          : `${b.days_left} يوم`}
                      </Badge>
                    </td>
                    <td className="font-bold text-gold">{b.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="relative mb-4 max-w-sm">
        <Search
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <Input
          className="pr-9"
          placeholder="ابحث بالمنتج أو الكود..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState message="لا توجد كميات" icon={<Boxes size={26} />} />
      ) : (
        <Table
          head={
            <>
              <th>المنتج</th>
              <th>الكود</th>
              <th>نوع الموقع</th>
              <th>الكمية</th>
            </>
          }
        >
          {rows.map((r, i) => {
            const p = byId[r.product_id];
            const loc = locTypeLabel[r.location_type];
            return (
              <tr key={`${r.product_id}-${r.location_id}-${i}`}>
                <td className="font-semibold">{p?.name || r.product_id}</td>
                <td className="font-mono text-muted">{p?.product_code || '—'}</td>
                <td>
                  {loc ? (
                    <Badge tone={loc.tone}>{loc.label}</Badge>
                  ) : (
                    r.location_type
                  )}
                </td>
                <td className="font-bold text-gold">{r.quantity}</td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
