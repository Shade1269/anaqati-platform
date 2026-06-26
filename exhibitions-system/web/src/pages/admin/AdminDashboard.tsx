import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Store,
  CheckCircle2,
  Wallet,
  BarChart3,
  Banknote,
  TrendingUp,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminApi, accountingApi } from '../../lib/api';
import type { Branch, BranchPnl, CommissionResult } from '../../lib/types';
import {
  Button,
  Dialog,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Spinner,
  StatCard,
  StatusBadge,
  Table,
  useToast,
} from '../../components/ui';
import { sar } from '../../lib/format';
import { useAdminAuth } from '../../context/AdminAuthContext';
import RestaurantDashboard from '../restaurant/RestaurantDashboard';

export default function AdminDashboard() {
  const { profile } = useAdminAuth();
  if (profile?.tenant?.business_type === 'restaurant') return <RestaurantDashboard />;
  return <RetailDashboard />;
}

function RetailDashboard() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [salesToday, setSalesToday] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState<Branch | null>(null);
  const [cash, setCash] = useState<number | null>(null);
  const [netProfit, setNetProfit] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      const [b, s] = await Promise.all([
        supabase
          .from('branches')
          .select('id,name,location,status,target_amount_sar')
          .order('name'),
        supabase
          .from('sales')
          .select('total_sar,created_at')
          .gte('created_at', new Date().toISOString().slice(0, 10)),
      ]);
      if (b.error) setError(b.error.message);
      else setBranches((b.data as Branch[]) || []);
      if (!s.error && s.data) {
        const sum = (s.data as { total_sar: number }[]).reduce(
          (acc, r) => acc + (Number(r.total_sar) || 0),
          0
        );
        setSalesToday(sum);
      } else {
        setSalesToday(0);
      }
      setLoading(false);
    }
    load();
    // Accounting quick figures (admin-only RPCs); fail silently.
    accountingApi
      .financialSummary()
      .then((f) => setCash(f.cash))
      .catch(() => setCash(null));
    accountingApi
      .incomeStatement()
      .then((s) => setNetProfit(s.net_profit))
      .catch(() => setNetProfit(null));
  }, []);

  const activeCount = useMemo(
    () => branches.filter((b) => b.status !== 'closed').length,
    [branches]
  );

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="لوحة التحكم"
        subtitle="نظرة عامة على المعارض والأرباح"
        icon={<LayoutDashboard size={22} />}
      />
      <ErrorBanner message={error} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="إجمالي المعارض"
          value={branches.length}
          icon={<Store size={20} />}
          tone="info"
        />
        <StatCard
          label="المعارض النشطة"
          value={activeCount}
          icon={<CheckCircle2 size={20} />}
          tone="success"
        />
        <StatCard
          label="مبيعات اليوم"
          value={sar(salesToday ?? 0)}
          icon={<Wallet size={20} />}
          tone="gold"
        />
        <StatCard
          label="إجمالي الأهداف"
          value={sar(
            branches.reduce((a, b) => a + (b.target_amount_sar || 0), 0)
          )}
          icon={<BarChart3 size={20} />}
          tone="warning"
        />
      </div>

      {(cash !== null || netProfit !== null) && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <StatCard
            label="الخزينة (نقدًا)"
            value={sar(cash ?? 0)}
            icon={<Banknote size={20} />}
            tone="gold"
          />
          <StatCard
            label="صافي ربح هذا الشهر"
            value={sar(netProfit ?? 0)}
            icon={<TrendingUp size={20} />}
            tone={(netProfit ?? 0) >= 0 ? 'success' : 'danger'}
          />
        </div>
      )}

      {branches.length === 0 ? (
        <EmptyState message="لا توجد معارض بعد" icon={<Store size={26} />} />
      ) : (
        <Table
          head={
            <>
              <th>المعرض</th>
              <th>الموقع</th>
              <th>الهدف</th>
              <th>الحالة</th>
              <th></th>
            </>
          }
        >
          {branches.map((b) => (
            <tr key={b.id}>
              <td className="font-semibold">{b.name}</td>
              <td className="text-muted">{b.location || '—'}</td>
              <td className="text-gold">{sar(b.target_amount_sar || 0)}</td>
              <td>
                <StatusBadge status={b.status} />
              </td>
              <td>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<BarChart3 size={14} />}
                  onClick={() => setActive(b)}
                >
                  الأرباح والعمولة
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {active && (
        <BranchPnlDialog branch={active} onClose={() => setActive(null)} />
      )}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-2 last:border-0">
      <span className="text-muted">{label}</span>
      <span className={strong ? 'font-bold text-gold' : 'font-semibold text-text'}>
        {value}
      </span>
    </div>
  );
}

function BranchPnlDialog({
  branch,
  onClose,
}: {
  branch: Branch;
  onClose: () => void;
}) {
  const toast = useToast();
  const [pnl, setPnl] = useState<BranchPnl | null>(null);
  const [com, setCom] = useState<CommissionResult | null>(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    adminApi
      .branchPnl(branch.id)
      .then(setPnl)
      .catch((e) => toast.error((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch.id]);

  async function computeCommission() {
    setBusy('com');
    try {
      setCom(await adminApi.computeBranchCommission(branch.id));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function setStatus(status: 'approved' | 'paid' | 'cancelled') {
    setBusy(status);
    try {
      const n = await adminApi.setCommissionStatus(branch.id, status);
      toast.success(`تم تحديث ${n} عمولة إلى الحالة المطلوبة`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  return (
    <Dialog open onClose={onClose} title={`الأرباح — ${branch.name}`} size="md">
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
            قائمة الأرباح والخسائر
          </p>
          {!pnl ? (
            <Spinner />
          ) : (
            <div className="rounded-lg bg-bg-2 p-4 text-sm">
              <Row label="صافي المبيعات" value={sar(pnl.net_sales)} />
              <Row label="التكلفة" value={sar(pnl.cost)} />
              <Row label="المصروفات" value={sar(pnl.expenses)} />
              <Row label="العمولات" value={sar(pnl.commissions)} />
              <Row label="صافي الربح" value={sar(pnl.net_profit)} strong />
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              العمولة
            </p>
            <Button
              size="sm"
              variant="outline"
              loading={busy === 'com'}
              onClick={computeCommission}
            >
              حساب العمولة
            </Button>
          </div>
          {com && (
            <div className="rounded-lg bg-bg-2 p-4 text-sm">
              <Row
                label="الحالة"
                value={com.reached ? 'تحقق الهدف' : 'لم يتحقق'}
              />
              <Row label="المُحقَّق" value={sar(com.achieved)} />
              <Row label="الهدف" value={sar(com.target)} />
              <Row label="العمولة" value={sar(com.commission)} strong />
              {com.mode && <Row label="النمط" value={com.mode} />}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="success"
              size="sm"
              loading={busy === 'approved'}
              onClick={() => setStatus('approved')}
            >
              اعتماد العمولة
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={busy === 'paid'}
              onClick={() => setStatus('paid')}
            >
              تعليم كمدفوع
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={busy === 'cancelled'}
              onClick={() => setStatus('cancelled')}
            >
              إلغاء
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
