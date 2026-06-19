import { useState } from 'react';
import { employeeApi } from '../../lib/api';
import { useEmployeeAuth } from '../../context/EmployeeAuthContext';
import { useCurrentBranch } from '../../context/useCurrentBranch';
import { useEmployeeProducts } from './useEmployeeProducts';
import ProductLinePicker, { type Line } from '../../components/ProductLinePicker';
import { ErrorBox, PageTitle, Spinner, SuccessBox } from '../../components/ui';

export default function EmployeeRequestStock() {
  const { session } = useEmployeeAuth();
  const branchId = useCurrentBranch();
  const { products, loading, error: loadError } = useEmployeeProducts();
  const [lines, setLines] = useState<Line[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
      await employeeApi.requestStock(
        session.token,
        branchId,
        lines.map((l) => ({ product_id: l.product_id, qty: l.qty }))
      );
      setSuccess('تم إرسال طلب البضاعة إلى المستودع');
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
      <PageTitle
        title="طلب بضاعة"
        subtitle="اطلب منتجات من المستودع للمعرض"
      />
      <ErrorBox message={loadError || error} />
      <SuccessBox message={success} />
      <div className="card mt-4 space-y-5">
        <ProductLinePicker
          products={products}
          lines={lines}
          onChange={setLines}
        />
        <button
          className="btn-primary w-full"
          onClick={submit}
          disabled={submitting}
        >
          {submitting ? 'جارٍ الإرسال...' : 'إرسال الطلب'}
        </button>
      </div>
    </div>
  );
}
