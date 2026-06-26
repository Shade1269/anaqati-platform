import { useEffect, useState } from 'react';
import { Users, Plus, Copy, Check, KeyRound, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import type { Permissions, EmployeePermissions } from '../../lib/types';
import { useAdminAuth } from '../../context/AdminAuthContext';
import {
  Button,
  Card,
  CardHeader,
  Dialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  StatusBadge,
  Table,
  useToast,
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

const roleLabels: Record<string, string> = {
  admin: 'أدمن',
  inventory_manager: 'مدير مخزون',
  employee: 'موظف',
};

export default function AdminEmployees() {
  const { profile } = useAdminAuth();
  const bizType = profile?.tenant?.business_type || 'retail';
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [emp, setEmp] = useState({ ...emptyEmp });
  const [saving, setSaving] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id,full_name,role,status,im_permissions(can_add_stock,can_approve_requests,can_issue_transfers,can_issue_wholesale,can_receive_returns,can_manage_employees,can_manage_store,can_manage_restaurant,can_manage_market)'
      )
      .order('full_name');
    if (error) toast.error(error.message);
    else
      setProfiles(
        ((data as Record<string, unknown>[]) || []).map((r) => {
          const perm = r.im_permissions;
          return {
            id: r.id as string,
            full_name: r.full_name as string,
            role: r.role as string,
            status: r.status as string,
            permissions: (Array.isArray(perm) ? perm[0] : perm) as Permissions | null,
          };
        })
      );
    setLoading(false);
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
      const res = await adminApi.createEmployee(
        emp.full_name.trim(),
        emp.phone.trim(),
        Number(emp.monthly_salary) || 0,
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

  function copyCode() {
    navigator.clipboard?.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const imUsers = profiles.filter((p) => p.role === 'inventory_manager');

  return (
    <div>
      <PageHeader
        title="الموظفون"
        subtitle="إنشاء موظفين وإدارة الأدوار والصلاحيات"
        icon={<Users size={22} />}
      />

      <EmployeeLoginLink />

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
            onClick={copyCode}
          >
            {copied ? 'تم النسخ' : 'نسخ'}
          </Button>
        </div>
      )}

      <form onSubmit={createEmployee} className="mb-6">
        <Card>
          <CardHeader title="موظف جديد" icon={<Plus size={18} />} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            <Field label="الراتب الشهري">
              <Input
                type="number"
                step="0.01"
                value={emp.monthly_salary}
                onChange={(e) => setEmp({ ...emp, monthly_salary: e.target.value })}
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

      <h2 className="mb-3 text-base font-bold text-text">
        مديرو المخزون والصلاحيات
      </h2>
      {loading ? (
        <Spinner />
      ) : imUsers.length === 0 ? (
        <EmptyState message="لا يوجد مديرو مخزون" />
      ) : (
        <div className="mb-8 space-y-4">
          {imUsers.map((p) => (
            <ImRow key={p.id} profile={p} onChanged={load} />
          ))}
        </div>
      )}

      <h2 className="mb-3 text-base font-bold text-text">كل الملفات</h2>
      {!loading && (
        <Table
          head={
            <>
              <th>الاسم</th>
              <th>الدور</th>
              <th>الحالة</th>
              <th></th>
            </>
          }
        >
          {profiles.map((p) => (
            <ProfileActionRow key={p.id} profile={p} bizType={bizType} onChanged={load} />
          ))}
        </Table>
      )}
    </div>
  );
}

// رابط دخول الموظفين — غير ظاهر للعامة؛ المالك ينسخه ويعطيه لموظفيه.
function EmployeeLoginLink() {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/employee/login`;

  function copy() {
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info/30 bg-info/8 px-4 py-3 text-sm">
      <span className="flex items-center gap-2 text-text">
        <KeyRound size={16} className="text-info" />
        رابط دخول الموظفين (شاركه مع موظفيك فقط):
        <code className="rounded bg-surface-2 px-2 py-0.5 font-mono text-xs text-muted" dir="ltr">
          {url}
        </code>
      </span>
      <Button
        size="sm"
        variant="outline"
        icon={copied ? <Check size={14} /> : <Copy size={14} />}
        onClick={copy}
      >
        {copied ? 'تم النسخ' : 'نسخ الرابط'}
      </Button>
    </div>
  );
}

function ProfileActionRow({
  profile,
  bizType,
  onChanged,
}: {
  profile: ProfileRow;
  bizType: string;
  onChanged: () => void;
}) {
  const [role, setRole] = useState(profile.role);
  const [busy, setBusy] = useState(false);
  const [permsOpen, setPermsOpen] = useState(false);
  const toast = useToast();

  async function saveRole(newRole: string) {
    setRole(newRole);
    setBusy(true);
    try {
      await adminApi.setUserRole(profile.id, newRole, profile.status || 'active');
      toast.success('تم تحديث الدور');
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
      setRole(profile.role);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td className="font-semibold">{profile.full_name}</td>
      <td className="text-muted">{roleLabels[profile.role] || profile.role}</td>
      <td>
        <StatusBadge status={profile.status} />
      </td>
      <td>
        <div className="flex items-center justify-end gap-2">
          {role === 'employee' && (
            <Button
              size="sm"
              variant="outline"
              icon={<ShieldCheck size={15} />}
              onClick={() => setPermsOpen(true)}
            >
              الصلاحيات
            </Button>
          )}
          <Select
            className="w-40"
            value={role}
            disabled={busy}
            onChange={(e) => saveRole(e.target.value)}
          >
            <option value="employee">موظف</option>
            <option value="inventory_manager">مدير مخزون</option>
            <option value="admin">أدمن</option>
          </Select>
        </div>
        {permsOpen && (
          <EmployeePermsDialog
            profileId={profile.id}
            name={profile.full_name}
            bizType={bizType}
            onClose={() => setPermsOpen(false)}
          />
        )}
      </td>
    </tr>
  );
}

const RETAIL_PERMS: { key: keyof EmployeePermissions; label: string }[] = [
  { key: 'can_sell', label: 'نقطة البيع' },
  { key: 'can_return', label: 'إرجاع المبيعات' },
  { key: 'can_request_stock', label: 'طلب بضاعة' },
  { key: 'can_withdraw', label: 'سحب عُهدة' },
  { key: 'can_settle', label: 'تسليم العُهدة' },
];
const RESTAURANT_PERMS: { key: keyof EmployeePermissions; label: string }[] = [
  { key: 'can_waiter', label: 'الطاولات (نادل)' },
  { key: 'can_kitchen', label: 'المطبخ (KDS)' },
];

function EmployeePermsDialog({
  profileId,
  name,
  bizType,
  onClose,
}: {
  profileId: string;
  name: string;
  bizType: string;
  onClose: () => void;
}) {
  const [perms, setPerms] = useState<EmployeePermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const fields = bizType === 'restaurant' ? RESTAURANT_PERMS : RETAIL_PERMS;

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setPerms(await adminApi.getEmployeePerms(profileId));
      } catch (e) {
        toast.error((e as Error).message);
        onClose();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  async function save() {
    if (!perms) return;
    setBusy(true);
    try {
      await adminApi.setEmployeePerms(profileId, perms);
      toast.success('تم حفظ صلاحيات الموظف');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`صلاحيات الموظف — ${name}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={save} loading={busy} disabled={loading || !perms}>
            حفظ
          </Button>
        </>
      }
    >
      {loading || !perms ? (
        <Spinner />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            عطّل ما لا تريد أن يصل إليه الموظف. الافتراضي: كل الصلاحيات مفعّلة.
          </p>
          <div className="flex flex-col gap-3">
            {fields.map((f) => (
              <Check2
                key={f.key}
                label={f.label}
                checked={perms[f.key]}
                onChange={() => setPerms((s) => (s ? { ...s, [f.key]: !s[f.key] } : s))}
              />
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}

function ImRow({
  profile,
  onChanged,
}: {
  profile: ProfileRow;
  onChanged: () => void;
}) {
  const p = profile.permissions || {};
  const [perms, setPerms] = useState({
    addStock: !!p.can_add_stock,
    approve: !!p.can_approve_requests,
    transfers: !!(p.can_issue_transfers || p.can_transfers),
    wholesale: !!p.can_issue_wholesale,
    returns: !!(p.can_receive_returns || p.can_returns),
    manageEmployees: !!p.can_manage_employees,
    manageStore: !!p.can_manage_store,
    manageRestaurant: !!p.can_manage_restaurant,
    manageMarket: !!p.can_manage_market,
    manageManufacturing: !!p.can_manage_manufacturing,
  });
  const [status, setStatus] = useState(profile.status);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function savePerms() {
    setBusy(true);
    try {
      await adminApi.setImPermissions(
        profile.id,
        perms.addStock,
        perms.approve,
        perms.transfers,
        perms.wholesale,
        perms.returns,
        perms.manageEmployees,
        perms.manageStore,
        perms.manageRestaurant,
        perms.manageMarket,
        perms.manageManufacturing
      );
      toast.success('تم حفظ الصلاحيات');
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveStatus() {
    setBusy(true);
    try {
      await adminApi.setUserRole(profile.id, profile.role, status);
      toast.success('تم تحديث الحالة');
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (key: keyof typeof perms) => () =>
    setPerms((s) => ({ ...s, [key]: !s[key] }));

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-text">{profile.full_name}</span>
        <div className="flex items-center gap-2">
          <Select
            className="w-36"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active">مفعّل</option>
            <option value="suspended">موقوف</option>
            <option value="pending">قيد المراجعة</option>
          </Select>
          <Button variant="ghost" size="sm" onClick={saveStatus} disabled={busy}>
            تحديث الحالة
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted/70">
            عمليات المخزون
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <Check2 label="استلام بضاعة" checked={perms.addStock} onChange={toggle('addStock')} />
            <Check2 label="مراجعة الطلبات" checked={perms.approve} onChange={toggle('approve')} />
            <Check2 label="التحويلات" checked={perms.transfers} onChange={toggle('transfers')} />
            <Check2 label="الجملة" checked={perms.wholesale} onChange={toggle('wholesale')} />
            <Check2 label="المرتجعات" checked={perms.returns} onChange={toggle('returns')} />
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted/70">
            الإدارة
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <Check2
              label="إدارة الموظفين"
              checked={perms.manageEmployees}
              onChange={toggle('manageEmployees')}
            />
            <Check2
              label="إدارة المتجر والمخزون"
              checked={perms.manageStore}
              onChange={toggle('manageStore')}
            />
            <Check2
              label="إدارة المطعم (طاولات/منيو/مطبخ)"
              checked={perms.manageRestaurant}
              onChange={toggle('manageRestaurant')}
            />
            <Check2
              label="إدارة السوق الداخلي"
              checked={perms.manageMarket}
              onChange={toggle('manageMarket')}
            />
            <Check2
              label="إدارة التصنيع"
              checked={perms.manageManufacturing}
              onChange={toggle('manageManufacturing')}
            />
          </div>
        </div>
      </div>
      <Button className="mt-3" size="sm" onClick={savePerms} loading={busy}>
        حفظ الصلاحيات
      </Button>
    </Card>
  );
}

function Check2({
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
      <span className="text-muted">{label}</span>
    </label>
  );
}
