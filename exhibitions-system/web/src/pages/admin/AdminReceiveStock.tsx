import { useEffect, useMemo, useState } from 'react';
import { PackagePlus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import type { ProductPublic, Supplier, Warehouse } from '../../lib/types';
import ProductLinePicker, {
  type Line,
  type LineProduct,
} from '../../components/ProductLinePicker';
import {
  Button,
  Card,
  Field,
  PageHeader,
  Select,
  Spinner,
  useToast,
} from '../../components/ui';

export default function AdminReceiveStock() {
  const [products, setProducts] = useState<ProductPublic[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

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
      supabase.from('warehouses').select('id,name,location,is_active').order('name'),
      supabase.from('suppliers').select('id,name,phone,notes').order('name'),
    ]).then(([p, w, s]) => {
      if (p.error) toast.error(p.error.message);
      setProducts((p.data as ProductPublic[]) || []);
      setWarehouses((w.data as Warehouse[]) || []);
      setSuppliers((s.data as Supplier[]) || []);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!warehouseId || !supplierId) return toast.error('اختر المستودع والمورد');
    if (lines.length === 0) return toast.error('أضف منتجًا واحدًا على الأقل');
    setSubmitting(true);
    try {
      await adminApi.receiveStock(
        warehouseId,
        supplierId,
        lines.map((l) => ({
          product_id: l.product_id,
          qty: l.qty,
          batch_no: l.batch_no?.trim() || undefined,
          expiry: l.expiry || undefined,
        }))
      );
      toast.success('تم استلام البضاعة في المستودع');
      setLines([]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="استلام بضاعة"
        subtitle="إدخال بضاعة من مورد إلى مستودع"
        icon={<PackagePlus size={22} />}
      />

      <Card className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="المستودع">
            <Select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">—</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="المورد">
            <Select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <ProductLinePicker
          products={lineProducts}
          lines={lines}
          onChange={setLines}
          withBatch
        />
        <p className="text-xs text-muted">
          رقم الدفعة وتاريخ الصلاحية اختياريان — يُستخدمان لتتبّع الصلاحية وصرف
          الأقرب انتهاءً أولًا (FEFO).
        </p>

        <Button className="w-full" loading={submitting} onClick={submit}>
          استلام البضاعة
        </Button>
      </Card>
    </div>
  );
}
