import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import type { ProductPublic, Supplier, Warehouse } from '../../lib/types';
import ProductLinePicker, {
  type Line,
  type LineProduct,
} from '../../components/ProductLinePicker';
import {
  ErrorBox,
  PageTitle,
  Spinner,
  SuccessBox,
} from '../../components/ui';

export default function AdminReceiveStock() {
  const [products, setProducts] = useState<ProductPublic[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [warehouseId, setWarehouseId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase
        .from('products_public')
        .select('id,product_code,name,category_id,sale_price_ref,is_active')
        .order('name'),
      supabase
        .from('warehouses')
        .select('id,name,location,is_active')
        .order('name'),
      supabase.from('suppliers').select('id,name,phone,notes').order('name'),
    ]).then(([p, w, s]) => {
      if (p.error) setError(p.error.message);
      setProducts((p.data as ProductPublic[]) || []);
      setWarehouses((w.data as Warehouse[]) || []);
      setSuppliers((s.data as Supplier[]) || []);
      setLoading(false);
    });
  }, []);

  const lineProducts: LineProduct[] = useMemo(
    () =>
      products.map((p) => ({
        id: p.id,
        code: p.product_code,
        name: p.name,
        price_ref: p.sale_price_ref,
      })),
    [products]
  );

  async function submit() {
    if (!warehouseId || !supplierId) {
      setError('اختر المستودع والمورد');
      return;
    }
    if (lines.length === 0) {
      setError('أضف منتجًا واحدًا على الأقل');
      return;
    }
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      await adminApi.receiveStock(
        warehouseId,
        supplierId,
        lines.map((l) => ({ product_id: l.product_id, qty: l.qty }))
      );
      setSuccess('تم استلام البضاعة في المستودع');
      setLines([]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageTitle title="استلام بضاعة" subtitle="إدخال بضاعة من مورد إلى مستودع" />
      <ErrorBox message={error} />
      <SuccessBox message={success} />

      <div className="card space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">المستودع</label>
            <select
              className="input"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">—</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">المورد</label>
            <select
              className="input"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <ProductLinePicker
          products={lineProducts}
          lines={lines}
          onChange={setLines}
        />

        <button className="btn-primary w-full" onClick={submit} disabled={submitting}>
          {submitting ? 'جارٍ الحفظ...' : 'استلام البضاعة'}
        </button>
      </div>
    </div>
  );
}
