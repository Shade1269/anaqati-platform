import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  UserCheck,
  ArrowRight,
  ShoppingBag,
  Wallet,
  AlertTriangle,
  Boxes,
  HandCoins,
  Percent,
  CalendarCheck,
  Banknote,
  Copy,
  Check,
  ClipboardList,
} from 'lucide-react';
import { adminApi } from '../../lib/api';
import type { EmployeeFile, EmployeeConsignmentReport } from '../../lib/types';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Spinner,
  StatCard,
  StatusBadge,
  Table,
} from '../../components/ui';
import { fmtDate, sar } from '../../lib/format';

export default function AdminEmployeeFile() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();
  const [file, setFile] = useState<EmployeeFile | null>(null);
  const [report, setReport] = useState<EmployeeConsignmentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!employeeId) return;
    setLoading(true);
    setError('');
    Promise.all([
      adminApi.employeeFile(employeeId),
      adminApi.employeeConsignmentReport(employeeId),
    ])
      .then(([f, r]) => {
        setFile(f);
        setReport(r);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [employeeId]);

  function copyCode(code: string) {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const cashRemaining =
    report &&
    report.cash.sales -
      report.cash.returns -
      report.cash.settled -
      report.cash.shortage;

  return (
    <div>
      <PageHeader
        title="ملف الموظف"
        subtitle={file?.profile.full_name || ''}
        icon={<UserCheck size={22} />}
        action={
          <Button
            variant="ghost"
            icon={<ArrowRight size={16} />}
            onClick={() => navigate('/admin/monitoring')}
          >
            رجوع
          </Button>
        }
      />
      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : !file ? (
        <EmptyState message="تعذّر تحميل ملف الموظف" />
      ) : (
        <div className="space-y-6">
          {/* Profile bar */}
          <Card className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary-hover">
                <UserCheck size={22} />
              </div>
              <div>
                <p className="text-lg font-extrabold text-text">
                  {file.profile.full_name}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {file.profile.phone || '—'} · تاريخ التعيين:{' '}
                  {fmtDate(file.profile.hire_date)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {file.profile.access_code && (
                <button
                  onClick={() => copyCode(file.profile.access_code!)}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-text transition hover:border-primary/40"
                  title="نسخ رمز الدخول"
                >
                  <span className="text-muted">رمز الدخول:</span>
                  <span className="font-mono tracking-widest text-gold">
                    {file.profile.access_code}
                  </span>
                  {copied ? (
                    <Check size={15} className="text-success" />
                  ) : (
                    <Copy size={15} className="text-muted" />
                  )}
                </button>
              )}
              <StatusBadge status={file.profile.status || undefined} />
            </div>
          </Card>

          {/* StatCards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="المبيعات"
              value={sar(file.sales_total)}
              hint={`${file.sales_count} عملية`}
              icon={<ShoppingBag size={20} />}
              tone="success"
            />
            <StatCard
              label="الكاش المستحق عليه"
              value={sar(file.cash_due)}
              icon={<Wallet size={20} />}
              tone={file.cash_due > 0 ? 'danger' : 'gold'}
            />
            <StatCard
              label="العجوزات"
              value={sar(file.shortages_total)}
              icon={<AlertTriangle size={20} />}
              tone="warning"
            />
            <StatCard
              label="قيمة العهدة الحالية"
              value={sar(file.consignment_retail)}
              hint={`${file.consignment_qty} قطعة`}
              icon={<Boxes size={20} />}
              tone="info"
            />
            <StatCard
              label="السُلف"
              value={sar(file.advances_total)}
              icon={<HandCoins size={20} />}
              tone="warning"
            />
            <StatCard
              label="العمولات"
              value={sar(file.commissions_total)}
              icon={<Percent size={20} />}
              tone="gold"
            />
            <StatCard
              label="أيام الحضور هذا الشهر"
              value={file.present_days_month}
              icon={<CalendarCheck size={20} />}
              tone="info"
            />
            <StatCard
              label="الراتب الشهري"
              value={sar(file.profile.monthly_salary_sar)}
              icon={<Banknote size={20} />}
              tone="gold"
            />
          </div>

          {/* Consignment reconciliation */}
          <Card>
            <CardHeader
              title="كشف مطابقة العهدة"
              icon={<ClipboardList size={18} />}
            />
            {!report || report.goods.length === 0 ? (
              <EmptyState message="لا توجد عهدة لهذا الموظف" />
            ) : (
              <Table
                head={
                  <>
                    <th>المنتج</th>
                    <th>الرمز</th>
                    <th>مسحوب</th>
                    <th>مباع</th>
                    <th>مرتجع</th>
                    <th>المتبقي</th>
                    <th>الفرق</th>
                  </>
                }
              >
                {report.goods.map((g) => (
                  <tr key={g.product_id}>
                    <td className="font-semibold">{g.name}</td>
                    <td className="text-muted">{g.code || '—'}</td>
                    <td>{g.withdrawn}</td>
                    <td>{g.sold}</td>
                    <td>{g.returned}</td>
                    <td className="font-semibold">{g.on_hand}</td>
                    <td
                      className={`font-bold ${
                        g.variance !== 0 ? 'text-danger' : 'text-success'
                      }`}
                    >
                      {g.variance}
                    </td>
                  </tr>
                ))}
              </Table>
            )}

            {report && (
              <div className="mt-5">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                  مطابقة الكاش
                </p>
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <CashMini label="مبيعات" value={report.cash.sales} tone="text-success" />
                  <CashMini label="مرتجعات" value={report.cash.returns} tone="text-danger" />
                  <CashMini label="مُسلّم" value={report.cash.settled} tone="text-info" />
                  <CashMini
                    label="عجز"
                    value={report.cash.shortage}
                    tone={report.cash.shortage > 0 ? 'text-danger' : 'text-muted'}
                  />
                  <CashMini
                    label="المتبقّي"
                    value={cashRemaining || 0}
                    tone={
                      (cashRemaining || 0) > 0 ? 'text-gold' : 'text-success'
                    }
                  />
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function CashMini({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className={`mt-1 text-lg font-extrabold ${tone}`}>{sar(value)}</p>
    </div>
  );
}
