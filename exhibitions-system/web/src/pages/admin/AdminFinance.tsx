import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import type { Branch, PayrollResult } from '../../lib/types';
import {
  ErrorBox,
  PageTitle,
  SuccessBox,
} from '../../components/ui';
import { sar } from '../../lib/format';

interface ProfileRow {
  id: string;
  full_name: string;
  role: string;
}

export default function AdminFinance() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // expense form
  const [exp, setExp] = useState({
    scope: 'general',
    branch_id: '',
    category: '',
    amount_sar: '',
    description: '',
    expense_date: '',
  });

  // advance form
  const [adv, setAdv] = useState({
    employee_id: '',
    amount_sar: '',
    branch_id: '',
    notes: '',
  });

  // payroll
  const [payEmp, setPayEmp] = useState('');
  const [payMonth, setPayMonth] = useState('');
  const [payroll, setPayroll] = useState<PayrollResult | null>(null);
  const [payBusy, setPayBusy] = useState(false);

  useEffect(() => {
    supabase
      .from('branches')
      .select('id,name')
      .order('name')
      .then(({ data }) => setBranches((data as Branch[]) || []));
    supabase
      .from('profiles')
      .select('id,full_name,role')
      .order('full_name')
      .then(({ data }) => setProfiles((data as ProfileRow[]) || []));
  }, []);

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    const { error: e2 } = await supabase.from('expenses').insert({
      scope: exp.scope,
      branch_id: exp.scope === 'branch' ? exp.branch_id || null : null,
      category: exp.category.trim() || null,
      amount_sar: Number(exp.amount_sar) || 0,
      description: exp.description.trim() || null,
      expense_date: exp.expense_date || null,
    });
    if (e2) setError(e2.message);
    else {
      setSuccess('تمت إضافة المصروف');
      setExp({
        scope: 'general',
        branch_id: '',
        category: '',
        amount_sar: '',
        description: '',
        expense_date: '',
      });
    }
  }

  async function addAdvance(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    const { error: e2 } = await supabase.from('salary_advances').insert({
      employee_id: adv.employee_id || null,
      amount_sar: Number(adv.amount_sar) || 0,
      branch_id: adv.branch_id || null,
      notes: adv.notes.trim() || null,
    });
    if (e2) setError(e2.message);
    else {
      setSuccess('تمت إضافة السلفة');
      setAdv({ employee_id: '', amount_sar: '', branch_id: '', notes: '' });
    }
  }

  async function runPayroll(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setPayroll(null);
    setPayBusy(true);
    try {
      const r = await adminApi.computePayroll(payEmp, payMonth);
      setPayroll(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPayBusy(false);
    }
  }

  return (
    <div>
      <PageTitle title="المالية" subtitle="المصروفات والسُلف والرواتب" />
      <ErrorBox message={error} />
      <SuccessBox message={success} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Expense */}
        <form onSubmit={addExpense} className="card space-y-3">
          <h2 className="font-bold text-slate-800">إضافة مصروف</h2>
          <div>
            <label className="label">النطاق</label>
            <select
              className="input"
              value={exp.scope}
              onChange={(e) => setExp({ ...exp, scope: e.target.value })}
            >
              <option value="general">عام</option>
              <option value="branch">معرض</option>
            </select>
          </div>
          {exp.scope === 'branch' && (
            <div>
              <label className="label">المعرض</label>
              <select
                className="input"
                value={exp.branch_id}
                onChange={(e) => setExp({ ...exp, branch_id: e.target.value })}
              >
                <option value="">—</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="label">التصنيف</label>
            <input
              className="input"
              value={exp.category}
              onChange={(e) => setExp({ ...exp, category: e.target.value })}
            />
          </div>
          <div>
            <label className="label">المبلغ</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={exp.amount_sar}
              onChange={(e) => setExp({ ...exp, amount_sar: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">الوصف</label>
            <input
              className="input"
              value={exp.description}
              onChange={(e) => setExp({ ...exp, description: e.target.value })}
            />
          </div>
          <div>
            <label className="label">التاريخ</label>
            <input
              type="date"
              className="input"
              value={exp.expense_date}
              onChange={(e) => setExp({ ...exp, expense_date: e.target.value })}
            />
          </div>
          <button className="btn-primary w-full">إضافة المصروف</button>
        </form>

        {/* Advance */}
        <form onSubmit={addAdvance} className="card space-y-3">
          <h2 className="font-bold text-slate-800">إضافة سلفة راتب</h2>
          <div>
            <label className="label">الموظف</label>
            <select
              className="input"
              value={adv.employee_id}
              onChange={(e) => setAdv({ ...adv, employee_id: e.target.value })}
              required
            >
              <option value="">—</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">المبلغ</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={adv.amount_sar}
              onChange={(e) => setAdv({ ...adv, amount_sar: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">المعرض (اختياري)</label>
            <select
              className="input"
              value={adv.branch_id}
              onChange={(e) => setAdv({ ...adv, branch_id: e.target.value })}
            >
              <option value="">—</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">ملاحظات</label>
            <input
              className="input"
              value={adv.notes}
              onChange={(e) => setAdv({ ...adv, notes: e.target.value })}
            />
          </div>
          <button className="btn-primary w-full">إضافة السلفة</button>
        </form>
      </div>

      {/* Payroll */}
      <form onSubmit={runPayroll} className="card mt-6 space-y-3">
        <h2 className="font-bold text-slate-800">حساب الراتب</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">الموظف</label>
            <select
              className="input"
              value={payEmp}
              onChange={(e) => setPayEmp(e.target.value)}
              required
            >
              <option value="">—</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">الشهر (YYYY-MM)</label>
            <input
              type="month"
              className="input"
              value={payMonth}
              onChange={(e) => setPayMonth(e.target.value)}
              required
            />
          </div>
          <div className="flex items-end">
            <button className="btn-primary w-full" disabled={payBusy}>
              {payBusy ? '...' : 'احسب'}
            </button>
          </div>
        </div>

        {payroll && (
          <div className="mt-3 grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-3">
            <Stat label="أيام الحضور" value={String(payroll.present_days)} />
            <Stat label="اليومية" value={sar(payroll.daily_rate)} />
            <Stat label="الإجمالي" value={sar(payroll.gross)} />
            <Stat label="السُلف" value={sar(payroll.advances)} />
            <Stat label="العمولة" value={sar(payroll.commission)} />
            <Stat label="الصافي" value={sar(payroll.net)} strong />
          </div>
        )}
      </form>
    </div>
  );
}

function Stat({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg ${strong ? 'font-bold text-emerald-600' : 'font-semibold'}`}>
        {value}
      </p>
    </div>
  );
}
