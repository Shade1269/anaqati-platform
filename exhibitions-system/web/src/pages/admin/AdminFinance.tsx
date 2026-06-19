import { useEffect, useState } from 'react';
import {
  Wallet,
  Receipt,
  HandCoins,
  CalendarCheck,
  Calculator,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import type { Branch, PayrollResult } from '../../lib/types';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  StatCard,
  Table,
  useToast,
} from '../../components/ui';
import { fmtDate, sar } from '../../lib/format';

interface ProfileRow {
  id: string;
  full_name: string;
  role: string;
}
interface ExpenseRow {
  id: string;
  scope: string;
  category: string | null;
  amount_sar: number;
  description: string | null;
  expense_date: string | null;
}
interface AdvanceRow {
  id: string;
  employee_id: string | null;
  amount_sar: number;
  notes: string | null;
  created_at?: string;
}

const tabs = [
  { key: 'expenses', label: 'المصروفات', icon: <Receipt size={16} /> },
  { key: 'advances', label: 'السُلف', icon: <HandCoins size={16} /> },
  { key: 'attendance', label: 'الحضور', icon: <CalendarCheck size={16} /> },
  { key: 'payroll', label: 'الرواتب', icon: <Calculator size={16} /> },
] as const;
type TabKey = (typeof tabs)[number]['key'];

export default function AdminFinance() {
  const [tab, setTab] = useState<TabKey>('expenses');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);

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

  return (
    <div>
      <PageHeader
        title="المالية"
        subtitle="المصروفات والسُلف والحضور والرواتب"
        icon={<Wallet size={22} />}
      />

      <div className="mb-6 flex flex-wrap gap-2 rounded-lg bg-bg-2 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition ${
              tab === t.key
                ? 'bg-primary text-[hsl(var(--primary-fg))]'
                : 'text-muted hover:text-text'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'expenses' && <Expenses branches={branches} />}
      {tab === 'advances' && <Advances branches={branches} profiles={profiles} />}
      {tab === 'attendance' && (
        <Attendance branches={branches} profiles={profiles} />
      )}
      {tab === 'payroll' && <Payroll profiles={profiles} />}
    </div>
  );
}

/* ----------------------------- Expenses ----------------------------- */
function Expenses({ branches }: { branches: Branch[] }) {
  const toast = useToast();
  const [list, setList] = useState<ExpenseRow[]>([]);
  const [exp, setExp] = useState({
    scope: 'general',
    branch_id: '',
    category: '',
    amount_sar: '',
    description: '',
    expense_date: '',
  });

  async function load() {
    const { data } = await supabase
      .from('expenses')
      .select('id,scope,category,amount_sar,description,expense_date')
      .order('expense_date', { ascending: false })
      .limit(100);
    setList((data as ExpenseRow[]) || []);
  }
  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('expenses').insert({
      scope: exp.scope,
      branch_id: exp.scope === 'branch' ? exp.branch_id || null : null,
      category: exp.category.trim() || null,
      amount_sar: Number(exp.amount_sar) || 0,
      description: exp.description.trim() || null,
      expense_date: exp.expense_date || null,
    });
    if (error) return toast.error(error.message);
    toast.success('تمت إضافة المصروف');
    setExp({
      scope: 'general',
      branch_id: '',
      category: '',
      amount_sar: '',
      description: '',
      expense_date: '',
    });
    load();
  }

  const total = list.reduce((a, r) => a + (Number(r.amount_sar) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="إجمالي المصروفات"
          value={sar(total)}
          icon={<Receipt size={20} />}
          tone="danger"
        />
      </div>
      <form onSubmit={add}>
        <Card>
          <CardHeader title="إضافة مصروف" icon={<Receipt size={18} />} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="النطاق">
              <Select
                value={exp.scope}
                onChange={(e) => setExp({ ...exp, scope: e.target.value })}
              >
                <option value="general">عام</option>
                <option value="branch">معرض</option>
              </Select>
            </Field>
            {exp.scope === 'branch' && (
              <Field label="المعرض">
                <Select
                  value={exp.branch_id}
                  onChange={(e) => setExp({ ...exp, branch_id: e.target.value })}
                >
                  <option value="">—</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="التصنيف">
              <Input
                value={exp.category}
                onChange={(e) => setExp({ ...exp, category: e.target.value })}
              />
            </Field>
            <Field label="المبلغ">
              <Input
                type="number"
                step="0.01"
                value={exp.amount_sar}
                onChange={(e) => setExp({ ...exp, amount_sar: e.target.value })}
                required
              />
            </Field>
            <Field label="الوصف">
              <Input
                value={exp.description}
                onChange={(e) => setExp({ ...exp, description: e.target.value })}
              />
            </Field>
            <Field label="التاريخ">
              <Input
                type="date"
                value={exp.expense_date}
                onChange={(e) => setExp({ ...exp, expense_date: e.target.value })}
              />
            </Field>
          </div>
          <div className="mt-4">
            <Button type="submit">إضافة المصروف</Button>
          </div>
        </Card>
      </form>

      {list.length === 0 ? (
        <EmptyState message="لا توجد مصروفات" />
      ) : (
        <Table
          head={
            <>
              <th>التاريخ</th>
              <th>النطاق</th>
              <th>التصنيف</th>
              <th>الوصف</th>
              <th>المبلغ</th>
            </>
          }
        >
          {list.map((r) => (
            <tr key={r.id}>
              <td className="text-muted">{fmtDate(r.expense_date)}</td>
              <td>{r.scope === 'branch' ? 'معرض' : 'عام'}</td>
              <td>{r.category || '—'}</td>
              <td className="text-muted">{r.description || '—'}</td>
              <td className="font-semibold text-danger">{sar(r.amount_sar)}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

/* ----------------------------- Advances ----------------------------- */
function Advances({
  branches,
  profiles,
}: {
  branches: Branch[];
  profiles: ProfileRow[];
}) {
  const toast = useToast();
  const [list, setList] = useState<AdvanceRow[]>([]);
  const [adv, setAdv] = useState({
    employee_id: '',
    amount_sar: '',
    branch_id: '',
    notes: '',
  });

  async function load() {
    const { data } = await supabase
      .from('salary_advances')
      .select('id,employee_id,amount_sar,notes,created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    setList((data as AdvanceRow[]) || []);
  }
  useEffect(() => {
    load();
  }, []);

  const empName = (id: string | null) =>
    profiles.find((p) => p.id === id)?.full_name || '—';

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('salary_advances').insert({
      employee_id: adv.employee_id || null,
      amount_sar: Number(adv.amount_sar) || 0,
      branch_id: adv.branch_id || null,
      notes: adv.notes.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success('تمت إضافة السلفة');
    setAdv({ employee_id: '', amount_sar: '', branch_id: '', notes: '' });
    load();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={add}>
        <Card>
          <CardHeader title="إضافة سلفة راتب" icon={<HandCoins size={18} />} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="الموظف">
              <Select
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
              </Select>
            </Field>
            <Field label="المبلغ">
              <Input
                type="number"
                step="0.01"
                value={adv.amount_sar}
                onChange={(e) => setAdv({ ...adv, amount_sar: e.target.value })}
                required
              />
            </Field>
            <Field label="المعرض (اختياري)">
              <Select
                value={adv.branch_id}
                onChange={(e) => setAdv({ ...adv, branch_id: e.target.value })}
              >
                <option value="">—</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="ملاحظات">
              <Input
                value={adv.notes}
                onChange={(e) => setAdv({ ...adv, notes: e.target.value })}
              />
            </Field>
          </div>
          <div className="mt-4">
            <Button type="submit">إضافة السلفة</Button>
          </div>
        </Card>
      </form>

      {list.length === 0 ? (
        <EmptyState message="لا توجد سُلف" />
      ) : (
        <Table
          head={
            <>
              <th>التاريخ</th>
              <th>الموظف</th>
              <th>المبلغ</th>
              <th>ملاحظات</th>
            </>
          }
        >
          {list.map((r) => (
            <tr key={r.id}>
              <td className="text-muted">{fmtDate(r.created_at)}</td>
              <td className="font-semibold">{empName(r.employee_id)}</td>
              <td className="text-gold">{sar(r.amount_sar)}</td>
              <td className="text-muted">{r.notes || '—'}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

/* ----------------------------- Attendance ----------------------------- */
function Attendance({
  branches,
  profiles,
}: {
  branches: Branch[];
  profiles: ProfileRow[];
}) {
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [employeeId, setEmployeeId] = useState('');
  const [workDate, setWorkDate] = useState(today);
  const [status, setStatus] = useState<'present' | 'absent'>('present');
  const [branchId, setBranchId] = useState('');
  const [busy, setBusy] = useState(false);

  async function record(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId) return toast.error('اختر الموظف');
    setBusy(true);
    try {
      await adminApi.recordAttendance(
        employeeId,
        workDate,
        status,
        branchId || null
      );
      toast.success('تم تسجيل الحضور');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={record}>
      <Card className="max-w-2xl">
        <CardHeader title="تسجيل الحضور" icon={<CalendarCheck size={18} />} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="الموظف">
            <Select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              required
            >
              <option value="">—</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="التاريخ">
            <Input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              required
            />
          </Field>
          <Field label="الحالة">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'present' | 'absent')}
            >
              <option value="present">حاضر</option>
              <option value="absent">غائب</option>
            </Select>
          </Field>
          <Field label="المعرض (اختياري)">
            <Select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="">—</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-4">
          <Button type="submit" loading={busy}>
            تسجيل
          </Button>
        </div>
      </Card>
    </form>
  );
}

/* ----------------------------- Payroll ----------------------------- */
function Payroll({ profiles }: { profiles: ProfileRow[] }) {
  const toast = useToast();
  const [payEmp, setPayEmp] = useState('');
  const [payMonth, setPayMonth] = useState('');
  const [payroll, setPayroll] = useState<PayrollResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setPayroll(null);
    setBusy(true);
    try {
      setPayroll(await adminApi.computePayroll(payEmp, payMonth));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={run}>
      <Card>
        <CardHeader title="حساب الراتب" icon={<Calculator size={18} />} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="الموظف">
            <Select
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
            </Select>
          </Field>
          <Field label="الشهر">
            <Input
              type="month"
              value={payMonth}
              onChange={(e) => setPayMonth(e.target.value)}
              required
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="w-full" loading={busy}>
              احسب
            </Button>
          </div>
        </div>

        {payroll && (
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <StatCard label="أيام الحضور" value={payroll.present_days} tone="info" />
            <StatCard label="اليومية" value={sar(payroll.daily_rate)} tone="info" />
            <StatCard label="الإجمالي" value={sar(payroll.gross)} tone="gold" />
            <StatCard label="السُلف" value={sar(payroll.advances)} tone="danger" />
            <StatCard label="العمولة" value={sar(payroll.commission)} tone="gold" />
            <StatCard label="الصافي" value={sar(payroll.net)} tone="success" />
          </div>
        )}
      </Card>
    </form>
  );
}
