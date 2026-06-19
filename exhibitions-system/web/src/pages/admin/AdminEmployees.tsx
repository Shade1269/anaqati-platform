import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import type { Permissions } from '../../lib/types';
import {
  Empty,
  ErrorBox,
  PageTitle,
  Spinner,
  SuccessBox,
} from '../../components/ui';

interface ProfileRow {
  id: string;
  full_name: string;
  role: string;
  status: string;
  permissions: Permissions | null;
}

const emptyEmp = {
  full_name: '',
  phone: '',
  monthly_salary: '',
  access_code: '',
  hire_date: '',
};

export default function AdminEmployees() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [emp, setEmp] = useState({ ...emptyEmp });
  const [saving, setSaving] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');

  async function load() {
    setLoading(true);
    const { data, error: e } = await supabase
      .from('profiles')
      .select('id,full_name,role,status,permissions')
      .order('full_name');
    if (e) setError(e.message);
    else setProfiles((data as ProfileRow[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createEmployee(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setGeneratedCode('');
    setSaving(true);
    try {
      const res = await adminApi.createEmployee(
        emp.full_name.trim(),
        emp.phone.trim(),
        Number(emp.monthly_salary) || 0,
        emp.access_code.trim() || null,
        emp.hire_date || null
      );
      setGeneratedCode(res.access_code);
      setSuccess('تم إنشاء الموظف');
      setEmp({ ...emptyEmp });
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const imUsers = profiles.filter((p) => p.role === 'inventory_manager');

  return (
    <div>
      <PageTitle title="الموظفون" subtitle="إنشاء موظفين وإدارة صلاحيات مديري المخزون" />
      <ErrorBox message={error} />
      <SuccessBox message={success} />

      {generatedCode && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span>
            كود الوصول للموظف: <strong className="font-mono">{generatedCode}</strong>
          </span>
          <button
            className="btn-ghost"
            onClick={() => navigator.clipboard?.writeText(generatedCode)}
          >
            نسخ
          </button>
        </div>
      )}

      <form
        onSubmit={createEmployee}
        className="card mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div>
          <label className="label">الاسم الكامل</label>
          <input
            className="input"
            value={emp.full_name}
            onChange={(e) => setEmp({ ...emp, full_name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">الجوال</label>
          <input
            className="input"
            value={emp.phone}
            onChange={(e) => setEmp({ ...emp, phone: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">الراتب الشهري</label>
          <input
            type="number"
            step="0.01"
            className="input"
            value={emp.monthly_salary}
            onChange={(e) =>
              setEmp({ ...emp, monthly_salary: e.target.value })
            }
          />
        </div>
        <div>
          <label className="label">كود الوصول (اختياري)</label>
          <input
            className="input"
            placeholder="يُولَّد تلقائيًا إن تُرك فارغًا"
            value={emp.access_code}
            onChange={(e) => setEmp({ ...emp, access_code: e.target.value })}
          />
        </div>
        <div>
          <label className="label">تاريخ التعيين</label>
          <input
            type="date"
            className="input"
            value={emp.hire_date}
            onChange={(e) => setEmp({ ...emp, hire_date: e.target.value })}
          />
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full" disabled={saving}>
            {saving ? 'جارٍ الحفظ...' : 'إنشاء موظف'}
          </button>
        </div>
      </form>

      <h2 className="mb-3 text-lg font-bold text-slate-800">
        مديرو المخزون والصلاحيات
      </h2>
      {loading ? (
        <Spinner />
      ) : imUsers.length === 0 ? (
        <Empty message="لا يوجد مديرو مخزون" />
      ) : (
        <div className="space-y-4">
          {imUsers.map((p) => (
            <ImRow key={p.id} profile={p} onChanged={load} setError={setError} setSuccess={setSuccess} />
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-lg font-bold text-slate-800">كل الملفات</h2>
      {!loading && (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الدور</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id}>
                  <td>{p.full_name}</td>
                  <td>{p.role}</td>
                  <td>{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ImRow({
  profile,
  onChanged,
  setError,
  setSuccess,
}: {
  profile: ProfileRow;
  onChanged: () => void;
  setError: (s: string) => void;
  setSuccess: (s: string) => void;
}) {
  const p = profile.permissions || {};
  const [perms, setPerms] = useState({
    addStock: !!p.can_add_stock,
    approve: !!p.can_approve_requests,
    transfers: !!p.can_transfers,
    wholesale: !!p.can_issue_wholesale,
    returns: !!p.can_returns,
  });
  const [status, setStatus] = useState(profile.status);
  const [busy, setBusy] = useState(false);

  async function savePerms() {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await adminApi.setImPermissions(
        profile.id,
        perms.addStock,
        perms.approve,
        perms.transfers,
        perms.wholesale,
        perms.returns
      );
      setSuccess('تم حفظ الصلاحيات');
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveStatus() {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await adminApi.setUserRole(profile.id, profile.role, status);
      setSuccess('تم تحديث الحالة');
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (key: keyof typeof perms) => () =>
    setPerms((s) => ({ ...s, [key]: !s[key] }));

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-bold text-slate-800">{profile.full_name}</span>
        <div className="flex items-center gap-2">
          <select
            className="input w-auto"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active">مفعّل</option>
            <option value="suspended">موقوف</option>
            <option value="pending">قيد المراجعة</option>
          </select>
          <button className="btn-ghost" onClick={saveStatus} disabled={busy}>
            تحديث الحالة
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <Check label="استلام بضاعة" checked={perms.addStock} onChange={toggle('addStock')} />
        <Check label="مراجعة الطلبات" checked={perms.approve} onChange={toggle('approve')} />
        <Check label="التحويلات" checked={perms.transfers} onChange={toggle('transfers')} />
        <Check label="الجملة" checked={perms.wholesale} onChange={toggle('wholesale')} />
        <Check label="المرتجعات" checked={perms.returns} onChange={toggle('returns')} />
      </div>
      <button className="btn-primary mt-3" onClick={savePerms} disabled={busy}>
        {busy ? '...' : 'حفظ الصلاحيات'}
      </button>
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="text-slate-600">{label}</span>
    </label>
  );
}
