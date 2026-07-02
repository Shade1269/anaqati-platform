import { useEffect, useMemo, useState } from 'react';
import { FileText, Plus, Send, Check, X, ShoppingCart, Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { crmApi, adminApi } from '../../lib/api';
import type {
  ProductPublic,
  Warehouse,
  QuotationRow,
  QuotationStatus,
} from '../../lib/types';
import ProductLinePicker, {
  type Line,
  type LineProduct,
  type UnitOption,
} from '../../components/ProductLinePicker';
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Table,
  useToast,
} from '../../components/ui';
import { sar } from '../../lib/format';

const STATUS: Record<QuotationStatus, { label: string; cls: string }> = {
  draft: { label: 'مسودة', cls: 'bg-white/10 text-muted' },
  sent: { label: 'مُرسل', cls: 'bg-info/15 text-info' },
  accepted: { label: 'مقبول', cls: 'bg-success/15 text-success' },
  rejected: { label: 'مرفوض', cls: 'bg-danger/15 text-danger' },
  converted: { label: 'محوّل لأمر بيع', cls: 'bg-gold/15 text-gold' },
  expired: { label: 'منتهٍ', cls: 'bg-warning/15 text-warning' },
};

export default function AdminQuotations() {
  const [rows, setRows] = useState<QuotationRow[]>([]);
  const [products, setProducts] = useState<ProductPublic[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  // editor
  const [dlg, setDlg] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [discount, setDiscount] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [unitsByProduct, setUnitsByProduct] = useState<Record<string, UnitOption[]>>({});
  const [saving, setSaving] = useState(false);

  // convert
  const [convId, setConvId] = useState<string | null>(null);
  const [convWh, setConvWh] = useState('');
  const [convPay, setConvPay] = useState('cash');
  const [converting, setConverting] = useState(false);

  async function load() {
    const list = await crmApi.quotationsList();
    setRows(list);
    setLoading(false);
  }
  useEffect(() => {
    Promise.all([
      supabase
        .from('products_public')
        .select('id,product_code,name,category_id,sale_price_ref,is_active')
        .order('name'),
      supabase.from('warehouses').select('id,name,location,is_active').order('name'),
    ]).then(([p, w]) => {
      setProducts(((p.data as ProductPublic[]) || []).filter((x) => x.is_active));
      setWarehouses((w.data as Warehouse[]) || []);
      load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lineProducts: LineProduct[] = useMemo(
    () => products.map((p) => ({ id: p.id, code: p.product_code, name: p.name, price_ref: p.sale_price_ref })),
    [products]
  );

  const total = useMemo(() => {
    const sub = lines.reduce((s, l) => s + (l.unit_price ?? 0) * l.qty, 0);
    return Math.max(0, sub - (Number(discount) || 0));
  }, [lines, discount]);

  function loadUnits(next: Line[]) {
    const missing = next.map((l) => l.product_id).filter((id) => !(id in unitsByProduct));
    missing.forEach((id) => {
      setUnitsByProduct((m) => ({ ...m, [id]: m[id] ?? [] }));
      adminApi
        .uomList(id)
        .then((res) => {
          const opts: UnitOption[] = [
            { id: null, label: res.base_unit, factor: 1 },
            ...res.units.map((u) => ({ id: u.id, label: u.unit_name, factor: u.factor })),
          ];
          setUnitsByProduct((m) => ({ ...m, [id]: opts }));
        })
        .catch(() => {});
    });
  }
  function handleLinesChange(next: Line[]) {
    setLines(next);
    loadUnits(next);
  }

  function openNew() {
    setEditId(null);
    setCustName('');
    setCustPhone('');
    setValidUntil('');
    setDiscount('');
    setNote('');
    setLines([]);
    setDlg(true);
  }

  async function openEdit(id: string) {
    try {
      const d = await crmApi.quotationGet(id);
      if (!d.quote) return toast.error('العرض غير موجود');
      setEditId(id);
      setCustName(d.quote.customer_name || '');
      setCustPhone(d.quote.customer_phone || '');
      setValidUntil(d.quote.valid_until || '');
      setDiscount(String(d.quote.discount_sar || ''));
      setNote(d.quote.note || '');
      const ls: Line[] = d.items.map((it) => ({
        product_id: it.product_id,
        qty: it.qty,
        unit_price: it.unit_price,
        uom_id: it.uom_id,
      }));
      setLines(ls);
      loadUnits(ls);
      setDlg(true);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function save() {
    if (lines.length === 0) return toast.error('أضف صنفًا واحدًا على الأقل');
    setSaving(true);
    try {
      await crmApi.quotationSet(
        editId,
        null,
        null,
        custName.trim() || null,
        custPhone.trim() || null,
        validUntil || null,
        Number(discount) || 0,
        note.trim() || null,
        lines.map((l) => ({
          product_id: l.product_id,
          qty: l.qty,
          unit_price: l.unit_price ?? 0,
          uom_id: l.uom_id ?? null,
          line_discount: 0,
        }))
      );
      toast.success('تم حفظ العرض');
      setDlg(false);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: string) {
    try {
      await crmApi.quotationSetStatus(id, status);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function doConvert() {
    if (!convId) return;
    if (!convWh) return toast.error('اختر المستودع');
    setConverting(true);
    try {
      const res = await crmApi.quotationConvert(convId, convWh, convPay);
      toast.success(`تم التحويل إلى أمر بيع — ${sar(res.total)}`);
      setConvId(null);
      setConvWh('');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConverting(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="عروض الأسعار"
        subtitle="أنشئ عرض سعر وحوّله إلى أمر بيع"
        icon={<FileText size={22} />}
        action={
          <Button icon={<Plus size={16} />} onClick={openNew}>
            عرض جديد
          </Button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState message="لا توجد عروض بعد" icon={<FileText size={26} />} />
      ) : (
        <Card>
          <Table
            head={
              <>
                <th>الرقم</th>
                <th>العميل</th>
                <th>الحالة</th>
                <th>الأصناف</th>
                <th>الإجمالي</th>
                <th>سارٍ حتى</th>
                <th></th>
              </>
            }
          >
            {rows.map((q) => {
              const st = STATUS[q.status];
              const editable = q.status === 'draft' || q.status === 'sent';
              return (
                <tr key={q.id}>
                  <td className="font-mono text-xs">{q.quote_no}</td>
                  <td className="font-semibold">{q.customer_name || '—'}</td>
                  <td>
                    <span className={`rounded px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>
                  </td>
                  <td className="text-muted">{q.items_count}</td>
                  <td className="font-bold text-gold">{sar(q.total_sar)}</td>
                  <td className="text-xs text-muted">{q.valid_until || '—'}</td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      {editable && (
                        <button
                          onClick={() => openEdit(q.id)}
                          className="rounded p-1.5 text-muted transition hover:bg-white/10 hover:text-text"
                          title="تعديل"
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                      {q.status === 'draft' && (
                        <button
                          onClick={() => setStatus(q.id, 'sent')}
                          className="rounded p-1.5 text-info transition hover:bg-info/10"
                          title="وضع كمُرسل"
                        >
                          <Send size={15} />
                        </button>
                      )}
                      {(q.status === 'sent' || q.status === 'draft') && (
                        <button
                          onClick={() => setStatus(q.id, 'accepted')}
                          className="rounded p-1.5 text-success transition hover:bg-success/10"
                          title="قبول"
                        >
                          <Check size={15} />
                        </button>
                      )}
                      {(q.status === 'sent' || q.status === 'draft') && (
                        <button
                          onClick={() => setStatus(q.id, 'rejected')}
                          className="rounded p-1.5 text-danger transition hover:bg-danger/10"
                          title="رفض"
                        >
                          <X size={15} />
                        </button>
                      )}
                      {q.status !== 'converted' && (
                        <button
                          onClick={() => {
                            setConvId(q.id);
                            setConvWh(warehouses[0]?.id || '');
                          }}
                          className="rounded p-1.5 text-gold transition hover:bg-gold/10"
                          title="تحويل إلى أمر بيع"
                        >
                          <ShoppingCart size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}

      {/* محرّر العرض */}
      <Dialog
        open={dlg}
        onClose={() => setDlg(false)}
        title={editId ? 'تعديل عرض سعر' : 'عرض سعر جديد'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDlg(false)}>
              إلغاء
            </Button>
            <Button loading={saving} onClick={save}>
              حفظ العرض
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="اسم العميل">
              <Input value={custName} onChange={(e) => setCustName(e.target.value)} />
            </Field>
            <Field label="جوال العميل">
              <Input value={custPhone} onChange={(e) => setCustPhone(e.target.value)} />
            </Field>
            <Field label="سارٍ حتى">
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </Field>
            <Field label="خصم على العرض">
              <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </Field>
          </div>

          <ProductLinePicker
            products={lineProducts}
            lines={lines}
            onChange={handleLinesChange}
            withPrice
            withUom
            unitsByProduct={unitsByProduct}
          />

          <Field label="ملاحظة">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>

          <div className="flex items-center justify-end border-t border-white/10 pt-3">
            <span className="text-lg font-bold text-text">
              الإجمالي: <span className="text-gold">{sar(total)}</span>
            </span>
          </div>
        </div>
      </Dialog>

      {/* تحويل إلى أمر بيع */}
      <Dialog
        open={!!convId}
        onClose={() => setConvId(null)}
        title="تحويل العرض إلى أمر بيع"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConvId(null)}>
              إلغاء
            </Button>
            <Button icon={<ShoppingCart size={15} />} loading={converting} onClick={doConvert}>
              تحويل
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            سيُنشأ أمر بيع جملة ويُخصم المخزون ويُرحّل محاسبيًا. لا يمكن التراجع.
          </p>
          <Field label="المستودع">
            <Select value={convWh} onChange={(e) => setConvWh(e.target.value)}>
              <option value="">—</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="طريقة الدفع">
            <Select value={convPay} onChange={(e) => setConvPay(e.target.value)}>
              <option value="cash">نقدًا</option>
              <option value="card">شبكة</option>
            </Select>
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
