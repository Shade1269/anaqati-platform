import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { ProductPublic } from '../../lib/types';
import {
  Empty,
  ErrorBox,
  PageTitle,
  Spinner,
} from '../../components/ui';

interface InventoryRow {
  product_id: string;
  location_type: string;
  location_id: string;
  quantity: number;
}

const locTypeLabel: Record<string, string> = {
  warehouse: 'مستودع',
  branch: 'معرض',
  employee_consignment: 'عُهدة موظف',
};

export default function AdminInventory() {
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [products, setProducts] = useState<ProductPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([
      supabase
        .from('inventory')
        .select('product_id,location_type,location_id,quantity'),
      supabase
        .from('products_public')
        .select('id,product_code,name,category_id,sale_price_ref,is_active'),
    ]).then(([inv, p]) => {
      if (inv.error) setError(inv.error.message);
      setInventory((inv.data as InventoryRow[]) || []);
      setProducts((p.data as ProductPublic[]) || []);
      setLoading(false);
    });
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
      <PageTitle
        title="المخزون"
        subtitle="الكميات حسب الموقع (بدون تكلفة)"
      />
      <ErrorBox message={error} />

      <div className="mb-4">
        <input
          className="input max-w-sm"
          placeholder="ابحث بالمنتج أو الكود..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {rows.length === 0 ? (
        <Empty message="لا توجد كميات" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>المنتج</th>
                <th>الكود</th>
                <th>نوع الموقع</th>
                <th>الكمية</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const p = byId[r.product_id];
                return (
                  <tr key={`${r.product_id}-${r.location_id}-${i}`}>
                    <td>{p?.name || r.product_id}</td>
                    <td>{p?.product_code || '—'}</td>
                    <td>{locTypeLabel[r.location_type] || r.location_type}</td>
                    <td className="font-semibold">{r.quantity}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
