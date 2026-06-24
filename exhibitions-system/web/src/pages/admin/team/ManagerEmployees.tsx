import { useEffect, useState } from 'react';
import {
  Users,
  Plus,
  Copy,
  Check,
  KeyRound,
  CalendarCheck,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { adminApi } from '../../../lib/api';
import type { ManagerEmployeeRow } from '../../../lib/types';
import {
  Button,
  Card,
  CardHeader,
  Dialog,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  StatusBadge,
  Table,
  useToast,
} from '../../../components/ui';
import { fmtDate } from '../../../lib/format';

const emptyEmp = {
  full_name: '',
  phone: '',
  access_code: '',
  hire_date: '',
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ManagerEmployees() {
  const toast = useToast();
  const [employees, setEmployees] = useState<ManagerEmployeeRow[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [emp, setEmp] = useState({ ...emptyEmp });
  const [saving, setSaving] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [copied, setCopied] = useState(false);

  // attendance dialog
  const [att, setAtt] = useState<ManagerEmployeeRow | null>(null);
  const [attDate, setAttDate] = useState(todayISO());
  const [attBranch, setAttBranch] = useState('');
  const [attBusy, setAttBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [list, br] = await Promise.all([
        adminApi.managerListEmployees(),
        supabase.from('branches').select('id,name').order('name'),
      ]);
      setEmployees(list || []);
      setBranches(
        ((br.data as { id: string; name: string }[]) || []).filter(Boolean)
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createEmployee(e: React.FormEvent) {
    e.preventDefault();
    setGeneratedCode('');
    setSaving(true);
    try {
      // Manager cannot set salary — backend ignores it for non-owners.
      const res = await adminApi.createEmployee(
        emp.full_name.trim(),
        emp.phone.trim(),
        0,
        emp.access_code.trim() || null,
        emp.hire_date || null
      );
      setGeneratedCode(res.access_code);
      toast.success('تم إنشاء الموظف');
      setEmp({ ...emptyEmp });
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function copyCode(code: string) {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function openAttendance(e: ManagerEmployeeRow) {
    setAtt(e);
    setAttDate(todayISO());
    setAttBranch(branches[0]?.id || '');
  }

  async function recordAttendance(status: 'present' | 'absent') {
    if (!att) return;
    setAttBusy(true);
    try {
      await adminApi.recordAttendance(
        att.id,
        attDate,
        status,
        attBranch || null
      );
      toast.success(
        status === 'present' ? 'تم تسجيل الحضور' : 'تم تسجيل الغياب'
      );
      setAtt(null);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAttBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="الموظفون"
        subtitle="إضافة الموظفين وتسجيل الحضور (بدون رواتب)"
        icon={<Users size={22} />}
      />

      {generatedCode && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/8 px-4 py-3 text-sm">
          <span className="flex items-center gap-2 text-text">
            <KeyRound size={16} className="text-primary-hover" />
            كود الوصول:{' '}
            <strong className="font-mono text-gold tracking-widest">
              {generatedCode}
            </strong>
          </span>
          <Button
            size="sm"
            variant="outline"
            icon={copied ? <Check size={14} /> : <Copy size={14} />}
            onClick={() => copyCode(generatedCode)}
          >
            {copied ? 'تم النسخ' : 'نسخ'}
          </Button>
        </div>
      )}

      <form onSubmit={createEmployee} className="mb-6">
        <Card>
          <CardHeader title="موظف جديد" icon={<Plus size={18} />} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="الاسم الكامل">
              <Input
                value={emp.full_name}
                onChange={(e) => setEmp({ ...emp, full_name: e.target.value })}
                required
              />
            </Field>
            <Field label="الجوال">
              <Input
                value={emp.phone}
                onChange={(e) => setEmp({ ...emp, phone: e.target.value })}
                required
              />
            </Field>
            <Field label="كود الوصول (اختياري)">
              <Input
                placeholder="يُولَّد تلقائيًا"
                value={emp.access_code}
                onChange={(e) => setEmp({ ...emp, access_code: e.target.value })}
              />
            </Field>
            <Field label="تاريخ التعيين">
              <Input
                type="date"
                value={emp.hire_date}
                onChange={(e) => setEmp({ ...emp, hire_date: e.target.value })}
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit" className="w-full" loading={saving}>
                إنشاء موظف
              </Button>
            </div>
          </div>
        </Card>
      </form>

      <h2 className="mb-3 text-base font-bold text-text">قائمة الموظفين</h2>
      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : employees.length === 0 ? (
        <EmptyState message="لا يوجد موظفون" icon={<Users size={26} />} />
      ) : (
        <Table
          head={
            <>
              <th>الاسم</th>
              <th>الجوال</th>
              <th>كود الوصول</th>
              <th>تاريخ التعيين</th>
              <th>الحالة</th>
              <th></th>
            </>
          }
        >
          {employees.map((e) => (
            <tr key={e.id}>
              <td className="font-semibold">{e.full_name}</td>
              <td className="text-muted" dir="ltr">
                {e.phone || '—'}
              </td>
              <td>
                {e.access_code ? (
                  <button
                    type="button"
                    onClick={() => copyCode(e.access_code as string)}
                    className="inline-flex items-center gap-1.5 font-mono tracking-widest text-gold hover:opacity-80"
                    title="نسخ الكود"
                  >
                    {e.access_code}
                    <Copy size={13} className="text-muted" />
                  </button>
                ) : (
                  '—'
                )}
              </td>
              <td className="text-muted">{fmtDate(e.hire_date)}</td>
              <td>
                <StatusBadge status={e.status || (e.is_active ? 'active' : 'suspended')} />
              </td>
              <td>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<CalendarCheck size={14} />}
                  onClick={() => openAttendance(e)}
                >
                  الحضور
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {/* Attendance dialog */}
      <Dialog
        open={!!att}
        onClose={() => setAtt(null)}
        title={att ? `حضور: ${att.full_name}` : ''}
        size="sm"
      >
        {att && (
          <div className="space-y-4">
            <Field label="التاريخ">
              <Input
                type="date"
                value={attDate}
                onChange={(e) => setAttDate(e.target.value)}
              />
            </Field>
            {branches.length > 0 && (
              <Field label="المعرض (اختياري)">
                <Select
                  value={attBranch}
                  onChange={(e) => setAttBranch(e.target.value)}
                >
                  <option value="">بدون تحديد</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="danger"
                loading={attBusy}
                onClick={() => recordAttendance('absent')}
              >
                غياب
              </Button>
              <Button
                variant="success"
                loading={attBusy}
                onClick={() => recordAttendance('present')}
              >
                حضور
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
