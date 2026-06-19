import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import type { ProductPublic, Warehouse } from '../../lib/types';
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
import { sar } from '../../lib/format';

export default function AdminWholesale() {
  const [products, setProducts] = useState<ProductPublic[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [payment, setPayment] = useState('cash');
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
    ]).then(([p, w]) => {
      if (p.error) setError(p.error.message);
      setProducts((p.data as ProductPublic[]) || []);
      setWarehouses((w.data as Warehouse[]) || []);
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

  const total = useMemo(
    () => lines.reduce((s, l) => s + (l.unit_price ?? 0) * l.qty, 0),
    [lines]
  );

  async function submit() {
    if (!warehouseId) {
      setError('اختر المستودع');
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
      const res = await adminApi.createWholesaleOrder(
        customerName.trim(),
        customerPhone.trim(),
        warehouseId,
        payment,
        lines.map((l) => ({
          product_id: l.product_id,
          qty: l.qty,
          unit_price: l.unit_price ?? 0,
        }))
      );
      setSuccess(`تم إنشاء طلب الجملة. الإجمالي: ${sar(res.total)}`);
      setLines([]);
      setCustomerName('');
      setCustomerPhone('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageTitle title="الجملة" subtitle="إنشاء طلب بيع بالجملة" />
      <ErrorBox message={error} />
      <SuccessBox message={success} />

      <div className="card space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label">اسم العميل</label>
            <input
              className="input"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">جوال العميل</label>
            <input
              className="input"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          </div>
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
            <label className="label">طريقة الدفع</label>
            <select
              className="input"
              value={payment}
              onChange={(e) => setPayment(e.target.value)}
            >
              <option value="cash">نقدًا</option>
              <option value="card">شبكة</option>
            </select>
          </div>
        </div>

        <ProductLinePicker
          products={lineProducts}
          lines={lines}
          onChange={setLines}
          withPrice
        />

        <div className="flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-lg font-bold">
            الإجمالي: <span className="text-emerald-600">{sar(total)}</span>
          </span>
          <button className="btn-emerald" onClick={submit} disabled={submitting}>
            {submitting ? 'جارٍ الحفظ...' : 'إنشاء الطلب'}
          </button>
        </div>
      </div>
    </div>
  );
}
