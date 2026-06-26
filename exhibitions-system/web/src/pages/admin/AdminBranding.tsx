import { useState } from 'react';
import { Palette } from 'lucide-react';
import { adminApi } from '../../lib/api';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { applyPrimaryColor } from '../../lib/theme';
import {
  Button,
  ErrorBanner,
  Field,
  Input,
  Select,
  PageHeader,
  useToast,
} from '../../components/ui';
import { setCurrency, setFx } from '../../lib/format';

export default function AdminBranding() {
  const { profile, refreshProfile } = useAdminAuth();
  const tenant = profile?.tenant ?? null;
  const toast = useToast();

  const [brandName, setBrandName] = useState(tenant?.brand_name || '');
  const [logoUrl, setLogoUrl] = useState(tenant?.logo_url || '');
  const [primaryColor, setPrimaryColor] = useState(
    tenant?.primary_color || '#C9A24B'
  );
  const [currency, setCurrencyCode] = useState(tenant?.currency || 'SAR');
  const [secCurrency, setSecCurrency] = useState(tenant?.secondary_currency || '');
  const [fxRate, setFxRate] = useState(tenant?.fx_rate ? String(tenant.fx_rate) : '');
  const [busy, setBusy] = useState(false);

  if (!profile?.tenant_id) {
    return (
      <div>
        <PageHeader
          title="العلامة التجارية"
          subtitle="تخصيص هوية مؤسستك"
          icon={<Palette size={22} />}
        />
        <ErrorBanner message="لا توجد مؤسسة مرتبطة بحسابك." />
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.tenant_id) return;
    setBusy(true);
    try {
      await adminApi.updateTenantBranding(
        profile.tenant_id,
        brandName.trim(),
        logoUrl.trim() || null,
        primaryColor,
        currency,
        secCurrency.trim() || null,
        Number(fxRate) || null
      );
      applyPrimaryColor(primaryColor);
      setCurrency(currency);
      setFx(secCurrency.trim() || null, Number(fxRate) || null);
      await refreshProfile();
      toast.success('تم حفظ العلامة التجارية');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="العلامة التجارية"
        subtitle="تخصيص اسم العلامة والشعار واللون الأساسي"
        icon={<Palette size={22} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <form
          onSubmit={submit}
          className="ax-card space-y-4 p-6 lg:col-span-2"
        >
          <Field label="اسم العلامة التجارية">
            <Input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="يظهر في الشريط الجانبي وأعلى اللوحة"
              required
            />
          </Field>

          <Field label="رابط الشعار (URL)">
            <Input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://...  (اختياري)"
            />
          </Field>

          <Field label="العملة">
            <Select value={currency} onChange={(e) => setCurrencyCode(e.target.value)}>
              <option value="SYP">ليرة سورية (ل.س)</option>
              <option value="USD">دولار ($)</option>
              <option value="TRY">ليرة تركية (₺)</option>
              <option value="SAR">ريال سعودي (ر.س)</option>
              <option value="AED">درهم (د.إ)</option>
              <option value="EUR">يورو (€)</option>
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="عملة ثانوية (اختياري)">
              <Select value={secCurrency} onChange={(e) => setSecCurrency(e.target.value)}>
                <option value="">— بلا —</option>
                <option value="USD">دولار ($)</option>
                <option value="SYP">ليرة سورية (ل.س)</option>
                <option value="TRY">ليرة تركية (₺)</option>
                <option value="EUR">يورو (€)</option>
              </Select>
            </Field>
            <Field label={`سعر الصرف (1 ${currency} = ؟ ثانوية)`}>
              <Input type="number" step="0.000001" value={fxRate} onChange={(e) => setFxRate(e.target.value)} placeholder="مثال: 1 دولار = 15000" />
            </Field>
          </div>
          <p className="-mt-1 text-[11px] text-muted">
            تُعرض القيمة المعادِلة بالعملة الثانوية بجانب الإجماليات والإيصالات. حدّث سعر الصرف يوميًا.
          </p>

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

          <div className="pt-2">
            <Button type="submit" loading={busy}>
              حفظ التغييرات
            </Button>
          </div>
        </form>

        {/* Live preview */}
        <div className="ax-card p-6">
          <p className="mb-4 text-xs font-bold uppercase tracking-wider text-muted/70">
            معاينة
          </p>
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl text-lg font-extrabold"
              style={{
                background: `${primaryColor}26`,
                color: primaryColor,
              }}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                '⬩'
              )}
            </div>
            <div>
              <p className="text-sm font-extrabold text-text">
                {brandName || 'العلامة التجارية'}
              </p>
              <p className="text-[11px] text-muted">لوحة الأدمن</p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div
              className="rounded-lg px-4 py-2.5 text-center text-sm font-semibold"
              style={{ background: primaryColor, color: '#1a1505' }}
            >
              زر أساسي
            </div>
            <div
              className="rounded-lg border px-4 py-2.5 text-center text-sm font-semibold"
              style={{
                borderColor: `${primaryColor}73`,
                color: primaryColor,
                background: `${primaryColor}10`,
              }}
            >
              زر محدّد
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
