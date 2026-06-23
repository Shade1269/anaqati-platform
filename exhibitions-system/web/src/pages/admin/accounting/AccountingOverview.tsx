import { useEffect, useState } from 'react';
import {
  Calculator,
  Banknote,
  CreditCard,
  Boxes,
  Users,
  Truck,
  Percent,
  Lock,
  AlertTriangle,
} from 'lucide-react';
import { accountingApi } from '../../../lib/api';
import type { FinancialSummary } from '../../../lib/types';
import {
  Button,
  Dialog,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Spinner,
  StatCard,
  useToast,
} from '../../../components/ui';
import { sar } from '../../../lib/format';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function AccountingOverview() {
  const [data, setData] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [closeOpen, setCloseOpen] = useState(false);

  useEffect(() => {
    accountingApi
      .financialSummary()
      .then(setData)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="النظرة المالية / الصندوق"
        subtitle="ملخص الخزينة والأرصدة الرئيسية"
        icon={<Calculator size={22} />}
        action={
          <Button
            variant="outline"
            icon={<Lock size={16} />}
            onClick={() => setCloseOpen(true)}
          >
            إقفال الفترة
          </Button>
        }
      />
      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="الخزينة — نقدًا"
            value={sar(data.cash)}
            icon={<Banknote size={20} />}
            tone="gold"
          />
          <StatCard
            label="الخزينة — شبكة"
            value={sar(data.card)}
            icon={<CreditCard size={20} />}
            tone="info"
          />
          <StatCard
            label="قيمة المخزون"
            value={sar(data.inventory_value)}
            icon={<Boxes size={20} />}
            tone="success"
          />
          <StatCard
            label="مستحق على الموظفين"
            value={sar(data.employee_receivable)}
            icon={<Users size={20} />}
            tone="warning"
          />
          <StatCard
            label="مستحق للموردين"
            value={sar(data.suppliers_payable)}
            icon={<Truck size={20} />}
            tone="danger"
          />
          <StatCard
            label="عمولات مستحقة"
            value={sar(data.commissions_payable)}
            icon={<Percent size={20} />}
            tone="danger"
          />
        </div>
      ) : null}

      {closeOpen && (
        <ClosePeriodDialog onClose={() => setCloseOpen(false)} />
      )}
    </div>
  );
}

function ClosePeriodDialog({ onClose }: { onClose: () => void }) {
  const [date, setDate] = useState(today());
  const [memo, setMemo] = useState('إقفال الفترة');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function confirm() {
    setBusy(true);
    try {
      const res = await accountingApi.closePeriod(date, memo.trim());
      if (!res.closed) {
        toast.toast('لا يوجد ما يُقفَل لهذه الفترة', 'info');
      } else {
        toast.success(`تم الإقفال — صافي الدخل: ${sar(res.net_income || 0)}`);
      }
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="إقفال الفترة"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="danger" loading={busy} onClick={confirm}>
            تأكيد الإقفال
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/8 px-4 py-3 text-sm text-warning">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>
            سيتم ترحيل قيد إقفال ينقل صافي الربح إلى حساب الأرباح المحتجزة. لا
            يمكن التراجع عن هذه العملية بسهولة.
          </span>
        </div>
        <Field label="تاريخ الإقفال">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="البيان">
          <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
