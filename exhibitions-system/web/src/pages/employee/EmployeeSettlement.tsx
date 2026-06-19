import { useState } from 'react';
import { employeeApi } from '../../lib/api';
import { useEmployeeAuth } from '../../context/EmployeeAuthContext';
import { ErrorBox, PageTitle, SuccessBox } from '../../components/ui';
import { sar } from '../../lib/format';

export default function EmployeeSettlement() {
  const { session } = useEmployeeAuth();
  const [cash, setCash] = useState('');
  const [card, setCard] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const total = (Number(cash) || 0) + (Number(card) || 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      await employeeApi.submitSettlement(
        session.token,
        Number(cash) || 0,
        Number(card) || 0
      );
      setSuccess('تم إرسال التسليم للمراجعة');
      setCash('');
      setCard('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageTitle
        title="تسليم العُهدة"
        subtitle="أدخل المبالغ المُصرَّح بها لتسليمها"
      />
      <ErrorBox message={error} />
      <SuccessBox message={success} />
      <form onSubmit={submit} className="card mt-4 max-w-md space-y-4">
        <div>
          <label className="label">النقد (كاش)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className="input"
            value={cash}
            onChange={(e) => setCash(e.target.value)}
          />
        </div>
        <div>
          <label className="label">الشبكة (بطاقة)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className="input"
            value={card}
            onChange={(e) => setCard(e.target.value)}
          />
        </div>
        <div className="text-lg font-bold text-slate-800">
          الإجمالي: <span className="text-emerald-600">{sar(total)}</span>
        </div>
        <button className="btn-emerald w-full" disabled={submitting}>
          {submitting ? 'جارٍ الإرسال...' : 'تأكيد التسليم'}
        </button>
      </form>
    </div>
  );
}
