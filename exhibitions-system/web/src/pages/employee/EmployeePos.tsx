import { useMemo, useState } from 'react';
import { employeeApi } from '../../lib/api';
import { useEmployeeAuth } from '../../context/EmployeeAuthContext';
import { useCurrentBranch } from '../../context/useCurrentBranch';
import { useEmployeeProducts } from './useEmployeeProducts';
import ProductLinePicker, { type Line } from '../../components/ProductLinePicker';
import { ErrorBox, PageTitle, Spinner, SuccessBox } from '../../components/ui';
import { sar } from '../../lib/format';

export default function EmployeePos() {
  const { session } = useEmployeeAuth();
  const branchId = useCurrentBranch();
  const { products, loading, error: loadError } = useEmployeeProducts();

  const [lines, setLines] = useState<Line[]>([]);
  const [payment, setPayment] = useState<'cash' | 'card'>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const total = useMemo(
    () => lines.reduce((s, l) => s + (l.unit_price ?? 0) * l.qty, 0),
    [lines]
  );

  async function submit() {
    if (!session || !branchId) {
      setError('اختر المعرض أولًا');
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
      setSuccess(`تم تسجيل البيع. الإجمالي: ${sar(res.total)}`);
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
      <PageTitle title="نقطة البيع" subtitle="سجّل عملية بيع جديدة" />
      <ErrorBox message={loadError || error} />
      <SuccessBox message={success} />

      <div className="card mt-4 space-y-5">
        <ProductLinePicker
          products={products}
          lines={lines}
          onChange={setLines}
          withPrice
        />

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-3">
            <label className="label mb-0">طريقة الدفع</label>
            <select
              className="input w-auto"
              value={payment}
              onChange={(e) => setPayment(e.target.value as 'cash' | 'card')}
            >
              <option value="cash">نقدًا</option>
              <option value="card">شبكة</option>
            </select>
          </div>
          <div className="text-lg font-bold text-slate-800">
            الإجمالي: <span className="text-emerald-600">{sar(total)}</span>
          </div>
        </div>

        <button
          className="btn-emerald w-full"
          onClick={submit}
          disabled={submitting}
        >
          {submitting ? 'جارٍ الحفظ...' : 'تأكيد البيع'}
        </button>
      </div>
    </div>
  );
}
