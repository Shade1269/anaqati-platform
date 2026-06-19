import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import type { Branch, BranchPnl, CommissionResult } from '../../lib/types';
import {
  Empty,
  ErrorBox,
  PageTitle,
  Spinner,
} from '../../components/ui';
import { sar } from '../../lib/format';

export default function AdminDashboard() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [pnl, setPnl] = useState<Record<string, BranchPnl>>({});
  const [commission, setCommission] = useState<Record<string, CommissionResult>>(
    {}
  );
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    supabase
      .from('branches')
      .select('id,name,location,status,target_amount_sar')
      .order('name')
      .then(({ data, error: e }) => {
        if (e) setError(e.message);
        else setBranches((data as Branch[]) || []);
        setLoading(false);
      });
  }, []);

  async function loadPnl(id: string) {
    setError('');
    setBusyId(id + ':pnl');
    try {
      const r = await adminApi.branchPnl(id);
      setPnl((p) => ({ ...p, [id]: r }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId('');
    }
  }

  async function loadCommission(id: string) {
    setError('');
    setBusyId(id + ':com');
    try {
      const r = await adminApi.computeBranchCommission(id);
      setCommission((c) => ({ ...c, [id]: r }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId('');
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageTitle title="لوحة التحكم" subtitle="نظرة عامة على المعارض وأرباحها" />
      <ErrorBox message={error} />

      {branches.length === 0 ? (
        <Empty message="لا توجد معارض بعد" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {branches.map((b) => {
            const p = pnl[b.id];
            const c = commission[b.id];
            return (
              <div key={b.id} className="card space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-slate-800">{b.name}</h2>
                  <span className="badge bg-slate-100 text-slate-600">
                    {b.status}
                  </span>
                </div>
                <p className="text-sm text-slate-500">
                  {b.location || '—'} · الهدف: {sar(b.target_amount_sar || 0)}
                </p>

                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-primary"
                    onClick={() => loadPnl(b.id)}
                    disabled={busyId === b.id + ':pnl'}
                  >
                    {busyId === b.id + ':pnl' ? '...' : 'حساب الربح'}
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => loadCommission(b.id)}
                    disabled={busyId === b.id + ':com'}
                  >
                    {busyId === b.id + ':com' ? '...' : 'حساب العمولة'}
                  </button>
                </div>

                {p && (
                  <div className="rounded-lg bg-slate-50 p-3 text-sm">
                    <Row label="صافي المبيعات" value={sar(p.net_sales)} />
                    <Row label="التكلفة" value={sar(p.cost)} />
                    <Row label="المصروفات" value={sar(p.expenses)} />
                    <Row label="العمولات" value={sar(p.commissions)} />
                    <div className="mt-2 border-t border-slate-200 pt-2">
                      <Row
                        label="صافي الربح"
                        value={sar(p.net_profit)}
                        strong
                      />
                    </div>
                  </div>
                )}

                {c && (
                  <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                    <Row
                      label="الحالة"
                      value={c.reached ? 'تحقق الهدف' : 'لم يتحقق'}
                    />
                    <Row label="المُحقَّق" value={sar(c.achieved)} />
                    <Row label="الهدف" value={sar(c.target)} />
                    <Row label="العمولة" value={sar(c.commission)} strong />
                    {c.mode && <Row label="النمط" value={c.mode} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
    <div className="flex items-center justify-between py-0.5">
      <span className="text-slate-500">{label}</span>
      <span className={strong ? 'font-bold' : 'font-medium'}>{value}</span>
    </div>
  );
}
