import { useEffect, useState } from 'react';
import {
  Building2,
  Plus,
  Users,
  Store,
  Power,
  PlayCircle,
  CalendarClock,
} from 'lucide-react';
import { platformApi } from '../../lib/api';
import type { PlatformTenant } from '../../lib/types';
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  Table,
  useToast,
} from '../../components/ui';
import { sar, fmtDate } from '../../lib/format';

function statusTone(s: string | null): 'success' | 'danger' | 'neutral' {
  if (s === 'active') return 'success';
  if (s === 'suspended') return 'danger';
  return 'neutral';
}

function subLabel(s: string | null): string {
  switch (s) {
    case 'trial':
      return 'تجريبي';
    case 'active':
      return 'مشترك';
    case 'expired':
      return 'منتهٍ';
    default:
      return '—';
  }
}

function subTone(s: string | null): 'gold' | 'success' | 'danger' | 'neutral' {
  switch (s) {
    case 'trial':
      return 'gold';
    case 'active':
      return 'success';
    case 'expired':
      return 'danger';
    default:
      return 'neutral';
  }
}

export default function PlatformTenants() {
  const [rows, setRows] = useState<PlatformTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<PlatformTenant | null>(null);
  const [subTarget, setSubTarget] = useState<PlatformTenant | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setRows(await platformApi.listTenants());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalTenants = rows.length;
  const activeTenants = rows.filter((t) => t.status === 'active').length;
  const totalSales = rows.reduce((a, t) => a + (t.sales_total || 0), 0);

  return (
    <div>
      <PageHeader
        title="العملاء"
        subtitle="إدارة المؤسسات المشتركة في المنصة"
        icon={<Building2 size={22} />}
        action={
          <Button icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
            عميل جديد
          </Button>
        }
      />

      <ErrorBanner message={error} />

      {!loading && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatCard
            label="إجمالي العملاء"
            value={totalTenants}
            icon={<Building2 size={20} />}
            tone="gold"
          />
          <StatCard
            label="العملاء النشطون"
            value={activeTenants}
            icon={<PlayCircle size={20} />}
            tone="success"
          />
          <StatCard
            label="إجمالي مبيعات المنصة"
            value={sar(totalSales)}
            icon={<Store size={20} />}
            tone="info"
          />
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState message="لا يوجد عملاء بعد" icon={<Building2 size={26} />} />
      ) : (
        <Table
          head={
            <>
              <th>المؤسسة</th>
              <th>بريد الأدمن</th>
              <th>الموظفون</th>
              <th>المعارض</th>
              <th>المبيعات</th>
              <th>الحالة</th>
              <th>الاشتراك</th>
              <th>الانتهاء</th>
              <th></th>
            </>
          }
        >
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="font-semibold">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full ring-1 ring-white/20"
                    style={{ background: t.primary_color || '#C9A24B' }}
                  />
                  <div>
                    <p className="flex items-center gap-2 text-text">
                      {t.brand_name || t.name}
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted">
                        {t.business_type === 'restaurant' ? 'مطعم' : 'تجزئة'}
                      </span>
                    </p>
                    {t.brand_name && t.brand_name !== t.name && (
                      <p className="text-xs text-muted">{t.name}</p>
                    )}
                  </div>
                </div>
              </td>
              <td className="text-muted">{t.admin_email || '—'}</td>
              <td>
                <span className="inline-flex items-center gap-1">
                  <Users size={14} className="text-muted" />
                  {t.employees}
                </span>
              </td>
              <td>
                <span className="inline-flex items-center gap-1">
                  <Store size={14} className="text-muted" />
                  {t.branches}
                </span>
              </td>
              <td>{sar(t.sales_total)}</td>
              <td>
                <Badge tone={statusTone(t.status)}>
                  {t.status === 'active'
                    ? 'مفعّل'
                    : t.status === 'suspended'
                      ? 'موقوف'
                      : t.status || '—'}
                </Badge>
              </td>
              <td>
                <Badge tone={subTone(t.subscription_status)}>
                  {subLabel(t.subscription_status)}
                </Badge>
              </td>
              <td className="text-muted">
                {fmtDate(t.subscription_expires_at)}
              </td>
              <td>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<CalendarClock size={14} />}
                    onClick={() => setSubTarget(t)}
                  >
                    الاشتراك
                  </Button>
                  {t.status === 'active' ? (
                    <Button
                      size="sm"
                      variant="danger"
                      icon={<Power size={14} />}
                      onClick={() => setStatusTarget(t)}
                    >
                      إيقاف
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="success"
                      icon={<PlayCircle size={14} />}
                      onClick={() => setStatusTarget(t)}
                    >
                      تفعيل
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {createOpen && (
        <CreateTenantDialog
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}

      {statusTarget && (
        <StatusDialog
          tenant={statusTarget}
          onClose={() => setStatusTarget(null)}
          onDone={() => {
            setStatusTarget(null);
            load();
          }}
        />
      )}

      {subTarget && (
        <SubscriptionDialog
          tenant={subTarget}
          onClose={() => setSubTarget(null)}
          onDone={() => {
            setSubTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CreateTenantDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#C9A24B');
  const [expires, setExpires] = useState('');
  const [businessType, setBusinessType] = useState<'retail' | 'restaurant'>('retail');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (adminPassword.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    setBusy(true);
    try {
      const res = await platformApi.createTenant({
        name: name.trim(),
        adminEmail: adminEmail.trim(),
        adminPassword,
        brandName: brandName.trim() || name.trim(),
        primaryColor,
        subscriptionExpires: expires || null,
        businessType,
      });
      toast.success(
        `تم إنشاء العميل. بريد الأدمن: ${res.admin_email} — شارك بيانات الدخول مع العميل`
      );
      onCreated();
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
      title="عميل جديد"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form="create-tenant-form" type="submit" loading={busy}>
            إنشاء العميل
          </Button>
        </>
      }
    >
      <form id="create-tenant-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم المؤسسة">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field label="الاسم التجاري (العلامة)">
            <Input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="اختياري — يُستخدم اسم المؤسسة إن تُرك فارغًا"
            />
          </Field>
        </div>
        <Field label="نوع النشاط">
          <Select
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value as 'retail' | 'restaurant')}
          >
            <option value="retail">تجزئة / متجر ومعارض</option>
            <option value="restaurant">مطعم / كافيه (طاولات ومطبخ)</option>
          </Select>
        </Field>
        <Field label="بريد الأدمن">
          <Input
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="كلمة مرور الأدمن">
          <Input
            type="text"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            required
            minLength={6}
            placeholder="6 أحرف على الأقل"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اللون الأساسي">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded-lg border border-white/10 bg-bg-2"
              />
              <Input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="flex-1"
              />
            </div>
          </Field>
          <Field label="انتهاء الاشتراك">
            <Input
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
          </Field>
        </div>
      </form>
    </Dialog>
  );
}

function StatusDialog({
  tenant,
  onClose,
  onDone,
}: {
  tenant: PlatformTenant;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const next: 'active' | 'suspended' =
    tenant.status === 'active' ? 'suspended' : 'active';
  const label = next === 'suspended' ? 'إيقاف' : 'تفعيل';

  async function confirm() {
    setBusy(true);
    try {
      await platformApi.setTenantStatus(tenant.id, next);
      toast.success(`تم ${label} العميل`);
      onDone();
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
      title={`${label} — ${tenant.brand_name || tenant.name}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            variant={next === 'suspended' ? 'danger' : 'success'}
            loading={busy}
            onClick={confirm}
          >
            تأكيد {label}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">
        {next === 'suspended'
          ? 'سيتم إيقاف وصول هذا العميل إلى النظام. يمكنك إعادة التفعيل لاحقًا.'
          : 'سيتم إعادة تفعيل وصول هذا العميل إلى النظام.'}
      </p>
    </Dialog>
  );
}

function SubscriptionDialog({
  tenant,
  onClose,
  onDone,
}: {
  tenant: PlatformTenant;
  onClose: () => void;
  onDone: () => void;
}) {
  const [subStatus, setSubStatus] = useState<'trial' | 'active' | 'expired'>(
    (tenant.subscription_status as 'trial' | 'active' | 'expired') || 'trial'
  );
  const [expires, setExpires] = useState(
    tenant.subscription_expires_at
      ? tenant.subscription_expires_at.slice(0, 10)
      : ''
  );
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await platformApi.setTenantStatus(
        tenant.id,
        (tenant.status as 'active' | 'suspended') || 'active',
        subStatus,
        expires || null
      );
      toast.success('تم تحديث الاشتراك');
      onDone();
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
      title={`الاشتراك — ${tenant.brand_name || tenant.name}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form="sub-form" type="submit" loading={busy}>
            حفظ
          </Button>
        </>
      }
    >
      <form id="sub-form" onSubmit={submit} className="space-y-4">
        <Field label="حالة الاشتراك">
          <Select
            value={subStatus}
            onChange={(e) =>
              setSubStatus(e.target.value as 'trial' | 'active' | 'expired')
            }
          >
            <option value="trial">تجريبي</option>
            <option value="active">مشترك</option>
            <option value="expired">منتهٍ</option>
          </Select>
        </Field>
        <Field label="تاريخ الانتهاء">
          <Input
            type="date"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
          />
        </Field>
      </form>
    </Dialog>
  );
}
