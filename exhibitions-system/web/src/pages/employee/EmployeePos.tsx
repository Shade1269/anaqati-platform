import { useMemo, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { employeeApi } from '../../lib/api';
import { useEmployeeAuth } from '../../context/EmployeeAuthContext';
import { useCurrentBranch } from '../../context/useCurrentBranch';
import { useEmployeeProducts } from './useEmployeeProducts';
import ProductLinePicker, { type Line } from '../../components/ProductLinePicker';
import {
  Button,
  Card,
  Field,
  PageHeader,
  Select,
  Spinner,
  useToast,
} from '../../components/ui';
import { sar } from '../../lib/format';

export default function EmployeePos() {
  const { session } = useEmployeeAuth();
  const branchId = useCurrentBranch();
  const { products, loading, error: loadError } = useEmployeeProducts();
  const toast = useToast();

  const [lines, setLines] = useState<Line[]>([]);
  const [payment, setPayment] = useState<'cash' | 'card'>('cash');
  const [submitting, setSubmitting] = useState(false);

  const total = useMemo(
    () => lines.reduce((s, l) => s + (l.unit_price ?? 0) * l.qty, 0),
    [lines]
  );

  async function submit() {
    if (!session || !branchId) return toast.error('اختر المعرض أولًا');
    if (lines.length === 0) return toast.error('أضف منتجًا واحدًا على الأقل');
    setSubmitting(true);
    try {
      const res = await employeeApi.createSale(
        session.token,
        branchId,
        payment,
        lines.map((l) => ({
          product_id: l.product_id,
          qty: l.qty,
          unit_sale_price: l.unit_price ?? 0,
        }))
      );
      toast.success(`تم تسجيل البيع — الإجمالي ${sar(res.total)}`);
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
        title="نقطة البيع"
        subtitle="سجّل عملية بيع جديدة"
        icon={<ShoppingBag size={22} />}
      />
      {loadError && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {loadError}
        </div>
      )}

      <Card className="space-y-5">
        <ProductLinePicker
          products={products}
          lines={lines}
          onChange={setLines}
          withPrice
        />

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
          <Field label="طريقة الدفع">
            <Select
              className="w-40"
              value={payment}
              onChange={(e) => setPayment(e.target.value as 'cash' | 'card')}
            >
              <option value="cash">نقدًا</option>
              <option value="card">شبكة</option>
            </Select>
          </Field>
          <div className="text-lg font-bold text-text">
            الإجمالي: <span className="text-gold">{sar(total)}</span>
          </div>
        </div>

        <Button
          variant="primary"
          className="w-full"
          loading={submitting}
          onClick={submit}
        >
          تأكيد البيع
        </Button>
      </Card>
    </div>
  );
}
