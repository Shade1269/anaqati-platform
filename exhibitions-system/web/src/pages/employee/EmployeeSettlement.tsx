import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { employeeApi } from '../../lib/api';
import { useEmployeeAuth } from '../../context/EmployeeAuthContext';
import {
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  useToast,
} from '../../components/ui';
import { sar } from '../../lib/format';

export default function EmployeeSettlement() {
  const { session } = useEmployeeAuth();
  const toast = useToast();
  const [cash, setCash] = useState('');
  const [card, setCard] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const total = (Number(cash) || 0) + (Number(card) || 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setSubmitting(true);
    try {
      await employeeApi.submitSettlement(
        session.token,
        Number(cash) || 0,
        Number(card) || 0
      );
      toast.success('تم إرسال التسليم للمراجعة');
      setCash('');
      setCard('');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="تسليم العُهدة"
        subtitle="أدخل المبالغ المُصرَّح بها لتسليمها"
        icon={<Wallet size={22} />}
      />
      <form onSubmit={submit}>
        <Card className="max-w-md space-y-4">
          <Field label="النقد (كاش)">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
            />
          </Field>
          <Field label="الشبكة (بطاقة)">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={card}
              onChange={(e) => setCard(e.target.value)}
            />
          </Field>
          <div className="rounded-lg bg-bg-2 px-4 py-3 text-lg font-bold text-text">
            الإجمالي: <span className="text-gold">{sar(total)}</span>
          </div>
          <Button type="submit" className="w-full" loading={submitting}>
            تأكيد التسليم
          </Button>
        </Card>
      </form>
    </div>
  );
}
