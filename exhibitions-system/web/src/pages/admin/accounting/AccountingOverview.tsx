import { useEffect, useState } from 'react';
import {
  Calculator,
  Banknote,
  CreditCard,
  Boxes,
  Users,
  Truck,
  Percent,
} from 'lucide-react';
import { accountingApi } from '../../../lib/api';
import type { FinancialSummary } from '../../../lib/types';
import {
  ErrorBanner,
  PageHeader,
  Spinner,
  StatCard,
} from '../../../components/ui';
import { sar } from '../../../lib/format';

export default function AccountingOverview() {
  const [data, setData] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    </div>
  );
}
