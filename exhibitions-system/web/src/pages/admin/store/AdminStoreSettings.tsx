import { useEffect, useState } from 'react';
import { currencyLabel } from '../../../lib/format';
import { Store, Copy, ExternalLink } from 'lucide-react';
import { adminStoreApi } from '../../../lib/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import type { StoreSettings } from '../../../lib/types';
import {
  Button,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Spinner,
  useToast,
} from '../../../components/ui';

export default function AdminStoreSettings() {
  const { profile } = useAdminAuth();
  const tenantId = profile?.tenant_id ?? null;
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [busy, setBusy] = useState(false);

  // form fields
  const [enabled, setEnabled] = useState(false);
  const [description, setDescription] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('');
  const [cod, setCod] = useState(false);

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const s = await adminStoreApi.getSettings(tenantId);
        setSettings(s);
        setEnabled(!!s.store_enabled);
        setDescription(s.store_description || '');
        setWhatsapp(s.store_whatsapp || '');
        setDeliveryFee(s.delivery_fee != null ? String(s.delivery_fee) : '');
        setCod(!!s.cod_enabled);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [tenantId]);

  const storeUrl =
    settings?.slug && typeof window !== 'undefined'
      ? `${window.location.origin}/store/${settings.slug}`
      : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    setBusy(true);
    try {
      await adminStoreApi.updateSettings({
        store_enabled: enabled,
        store_description: description.trim() || null,
        store_whatsapp: whatsapp.trim() || null,
        delivery_fee: deliveryFee ? Number(deliveryFee) : 0,
        cod_enabled: cod,
      });
      toast.success('تم حفظ إعدادات المتجر');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function copyLink() {
    if (!storeUrl) return;
    navigator.clipboard
      .writeText(storeUrl)
      .then(() => toast.success('تم نسخ الرابط'))
      .catch(() => toast.error('تعذّر نسخ الرابط'));
  }

  if (!tenantId) {
    return (
      <div>
        <PageHeader
          title="إعدادات المتجر"
          subtitle="إدارة المتجر الإلكتروني"
          icon={<Store size={22} />}
        />
        <ErrorBanner message="لا توجد مؤسسة مرتبطة بحسابك." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="إعدادات المتجر"
        subtitle="تفعيل المتجر الإلكتروني وإعداداته"
        icon={<Store size={22} />}
      />
      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <form onSubmit={submit} className="ax-card space-y-4 p-6 lg:col-span-2">
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-bg-2 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-text">تفعيل المتجر</p>
                <p className="text-xs text-muted">
                  عند الإيقاف لن يتمكن الزوار من الوصول للمتجر
                </p>
              </div>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-5 w-5"
              />
            </label>

            <Field label="وصف المتجر">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="يظهر أعلى صفحة المتجر"
                rows={3}
                className="ax-input"
              />
            </Field>

            <Field label="رقم واتساب">
              <Input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="9665xxxxxxxx"
                inputMode="tel"
              />
            </Field>

            <Field label={`رسوم التوصيل (${currencyLabel()})`}>
              <Input
                type="number"
                step="0.01"
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(e.target.value)}
                placeholder="0"
              />
            </Field>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-bg-2 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-text">
                  الدفع عند الاستلام
                </p>
                <p className="text-xs text-muted">السماح بالدفع نقدًا</p>
              </div>
              <input
                type="checkbox"
                checked={cod}
                onChange={(e) => setCod(e.target.checked)}
                className="h-5 w-5"
              />
            </label>

            <div className="pt-2">
              <Button type="submit" loading={busy}>
                حفظ الإعدادات
              </Button>
            </div>
          </form>

          {/* Public link card */}
          <div className="ax-card p-6">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted/70">
              رابط المتجر العام
            </p>
            {storeUrl ? (
              <>
                <div className="mb-4 break-all rounded-lg border border-white/10 bg-bg-2 px-3 py-2.5 text-sm text-gold">
                  {storeUrl}
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    icon={<Copy size={15} />}
                    onClick={copyLink}
                    type="button"
                  >
                    نسخ الرابط
                  </Button>
                  <a href={storeUrl} target="_blank" rel="noreferrer">
                    <Button
                      variant="ghost"
                      icon={<ExternalLink size={15} />}
                      type="button"
                      className="w-full"
                    >
                      فتح المتجر
                    </Button>
                  </a>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">
                لم يتم تعيين معرّف (slug) للمتجر بعد.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
