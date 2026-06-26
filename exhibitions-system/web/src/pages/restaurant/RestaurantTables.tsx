import { useEffect, useState } from 'react';
import { Armchair, Plus, QrCode, Copy, Check, Printer } from 'lucide-react';
import { restaurantApi } from '../../lib/api';
import type { DiningTable } from '../../lib/types';
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
  Spinner,
  Table,
  useToast,
} from '../../components/ui';

const empty = { id: null as string | null, label: '', section: '', seats: '4', active: true };

export default function RestaurantTables() {
  const { profile } = useAdminAuth();
  const tenantId = profile?.tenant_id || profile?.tenant?.id || '';
  const brand = profile?.tenant?.brand_name || profile?.tenant?.name || 'المطعم';
  const [rows, setRows] = useState<DiningTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...empty });
  const [saving, setSaving] = useState(false);
  const [qrFor, setQrFor] = useState<DiningTable | null>(null);
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      setRows(await restaurantApi.tables(null));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await restaurantApi.setTable(
        form.id,
        form.label.trim(),
        form.section.trim() || null,
        Number(form.seats) || 4,
        form.active
      );
      toast.success(form.id ? 'تم التعديل' : 'تمت الإضافة');
      setForm({ ...empty });
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="إدارة الطاولات" subtitle="أضِف طاولات المطعم وأقسامه" icon={<Armchair size={22} />} />

      <form onSubmit={save} className="mb-6">
        <Card>
          <CardHeader title={form.id ? 'تعديل طاولة' : 'طاولة جديدة'} icon={<Plus size={18} />} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="الاسم / الرقم">
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required />
            </Field>
            <Field label="القسم (اختياري)">
              <Input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} placeholder="صالة / تراس" />
            </Field>
            <Field label="عدد المقاعد">
              <Input type="number" min={1} value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} />
            </Field>
            <div className="flex items-end gap-2">
              <Button type="submit" className="flex-1" loading={saving}>
                {form.id ? 'حفظ' : 'إضافة'}
              </Button>
              {form.id && (
                <Button type="button" variant="ghost" onClick={() => setForm({ ...empty })}>
                  إلغاء
                </Button>
              )}
            </div>
          </div>
        </Card>
      </form>

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState message="لا توجد طاولات بعد." />
      ) : (
        <Table
          head={
            <>
              <th>الطاولة</th>
              <th>القسم</th>
              <th>المقاعد</th>
              <th>الحالة</th>
              <th></th>
            </>
          }
        >
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="font-semibold">{t.label}</td>
              <td className="text-muted">{t.section || '—'}</td>
              <td>{t.seats}</td>
              <td>{t.status === 'free' ? 'فاضية' : 'مشغولة'}</td>
              <td>
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" icon={<QrCode size={15} />} onClick={() => setQrFor(t)}>
                    QR
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setForm({ id: t.id, label: t.label, section: t.section || '', seats: String(t.seats), active: t.is_active })
                    }
                  >
                    تعديل
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {qrFor && (
        <QrDialog tenantId={tenantId} brand={brand} table={qrFor} onClose={() => setQrFor(null)} />
      )}
    </div>
  );
}

function QrDialog({
  tenantId,
  brand,
  table,
  onClose,
}: {
  tenantId: string;
  brand: string;
  table: DiningTable;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/r/${tenantId}/${table.id}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(url)}`;

  function copy() {
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function print() {
    const w = window.open('', '_blank', 'width=420,height=620');
    if (!w) return;
    w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><title>QR ${table.label}</title>
      <style>body{font-family:system-ui,Arial;text-align:center;padding:24px}
      h1{font-size:20px;margin:0 0 4px} h2{font-size:16px;color:#555;margin:0 0 16px}
      img{width:300px;height:300px} p{color:#666;font-size:12px;margin-top:12px;word-break:break-all}</style>
      </head><body><h1>${brand}</h1><h2>${table.label} — امسح للطلب</h2>
      <img src="${qrSrc}" alt="QR"/><p>${url}</p>
      <script>window.onload=function(){setTimeout(function(){window.print()},400)}</script>
      </body></html>`);
    w.document.close();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`رمز QR — ${table.label}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>إغلاق</Button>
          <Button icon={<Printer size={15} />} onClick={print}>طباعة</Button>
        </>
      }
    >
      <div className="space-y-3 text-center">
        <p className="text-sm text-muted">يضعه الزبون على الطاولة؛ يمسحه ليرى المنيو ويطلب مباشرة.</p>
        <img src={qrSrc} alt="QR" className="mx-auto h-56 w-56 rounded-lg bg-white p-2" />
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          <code className="flex-1 truncate text-left text-xs text-muted" dir="ltr">{url}</code>
          <Button size="sm" variant="outline" icon={copied ? <Check size={14} /> : <Copy size={14} />} onClick={copy}>
            {copied ? 'تم' : 'نسخ'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
