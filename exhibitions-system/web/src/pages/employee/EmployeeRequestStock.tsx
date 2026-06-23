import { useState } from 'react';
import { PackagePlus } from 'lucide-react';
import { employeeApi } from '../../lib/api';
import { useEmployeeAuth } from '../../context/EmployeeAuthContext';
import { useCurrentBranch } from '../../context/useCurrentBranch';
import { useEmployeeProducts } from './useEmployeeProducts';
import ProductLinePicker, { type Line } from '../../components/ProductLinePicker';
import { Button, Card, PageHeader, Spinner, useToast } from '../../components/ui';

export default function EmployeeRequestStock() {
  const { session } = useEmployeeAuth();
  const branchId = useCurrentBranch();
  const { products, loading, error: loadError } = useEmployeeProducts();
  const toast = useToast();
  const [lines, setLines] = useState<Line[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!session || !branchId) return toast.error('اختر المعرض أولًا');
    if (lines.length === 0) return toast.error('أضف منتجًا واحدًا على الأقل');
    setSubmitting(true);
    try {
      await employeeApi.requestStock(
        session.token,
        branchId,
        lines.map((l) => ({ product_id: l.product_id, qty: l.qty }))
      );
      toast.success('تم إرسال طلب البضاعة إلى المستودع');
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
        title="طلب بضاعة"
        subtitle="اطلب منتجات من المستودع للمعرض"
        icon={<PackagePlus size={22} />}
      />
      {loadError && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {loadError}
        </div>
      )}
      <Card className="space-y-5">
        <ProductLinePicker products={products} lines={lines} onChange={setLines} />
        <Button className="w-full" loading={submitting} onClick={submit}>
          إرسال الطلب
        </Button>
      </Card>
    </div>
  );
}
