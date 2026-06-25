import { useEffect, useState } from 'react';
import { Boxes, Plus, PackagePlus, ClipboardCheck, AlertTriangle } from 'lucide-react';
import { mfgApi } from '../../lib/api';
import type { MfgMaterial } from '../../lib/types';
import {
  Button, Card, CardHeader, Dialog, EmptyState, Field, Input, PageHeader, Spinner, Table, useToast,
} from '../../components/ui';

const num = (n: number) => (Math.round((n || 0) * 1000) / 1000).toString();
const money = (n: number) => `${(n || 0).toFixed(2)} ر.س`;
const emptyForm = { id: null as string | null, name: '', unit: 'قطعة', reorder: '0', cost: '0', active: true };

export default function MfgMaterials() {
  const [rows, setRows] = useState<MfgMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [lowOnly, setLowOnly] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [receiveFor, setReceiveFor] = useState<MfgMaterial | null>(null);
  const [adjustFor, setAdjustFor] = useState<MfgMaterial | null>(null);
  const toast = useToast();

  async function load() {
    setLoading(true);
    try { setRows(await mfgApi.materialsList(false)); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await mfgApi.setMaterial(form.id, form.name.trim(), form.unit.trim() || 'قطعة', Number(form.reorder) || 0, Number(form.cost) || 0, form.active);
      toast.success(form.id ? 'تم التعديل' : 'تمت الإضافة');
      setForm({ ...emptyForm });
      load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  const lowCount = rows.filter((r) => r.is_low).length;
  const shown = lowOnly ? rows.filter((r) => r.is_low) : rows;

  return (
    <div>
      <PageHeader title="مواد التصنيع" subtitle="المواد الخام والكميات والنواقص وقائمة الشراء" icon={<Boxes size={22} />} />
      {lowCount > 0 && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/8 px-4 py-3 text-sm text-danger">
          <AlertTriangle size={16} /> {lowCount} مادة تحت الحد الأدنى.
          <button className="font-bold underline" onClick={() => setLowOnly(true)}>عرض قائمة الشراء</button>
        </div>
      )}
      <form onSubmit={save} className="mb-6">
        <Card>
          <CardHeader title={form.id ? 'تعديل مادة' : 'مادة جديدة'} icon={<Plus size={18} />} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="اسم المادة"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="الوحدة"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="كغ / لتر / لوح" /></Field>
            <Field label="حد إعادة الطلب"><Input type="number" step="0.001" value={form.reorder} onChange={(e) => setForm({ ...form, reorder: e.target.value })} /></Field>
            <Field label="تكلفة الوحدة"><Input type="number" step="0.0001" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
            <div className="flex items-end gap-2">
              <Button type="submit" className="flex-1" loading={saving}>{form.id ? 'حفظ' : 'إضافة'}</Button>
              {form.id && <Button type="button" variant="ghost" onClick={() => setForm({ ...emptyForm })}>إلغاء</Button>}
            </div>
          </div>
        </Card>
      </form>
      <div className="mb-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> النواقص فقط (قائمة الشراء)
        </label>
      </div>
      {loading ? <Spinner /> : shown.length === 0 ? (
        <EmptyState message={lowOnly ? 'لا نواقص.' : 'لا مواد بعد.'} />
      ) : (
        <Table head={<><th>المادة</th><th>المتوفّر</th><th>حد الطلب</th><th>التكلفة</th><th></th></>}>
          {shown.map((r) => (
            <tr key={r.id} className={r.is_low ? 'bg-danger/5' : ''}>
              <td className="font-semibold">{r.name}{r.is_low && <span className="mr-2 rounded-full bg-danger/15 px-2 py-0.5 text-[10px] text-danger">ناقص</span>}</td>
              <td className={r.is_low ? 'font-bold text-danger' : ''}>{num(r.current_qty)} {r.unit}</td>
              <td className="text-muted">{num(r.reorder_level)} {r.unit}</td>
              <td className="text-muted">{money(r.cost_per_unit)}</td>
              <td>
                <div className="flex items-center justify-end gap-1">
                  <Button size="sm" variant="outline" icon={<PackagePlus size={14} />} onClick={() => setReceiveFor(r)}>توريد</Button>
                  <Button size="sm" variant="ghost" icon={<ClipboardCheck size={14} />} onClick={() => setAdjustFor(r)}>جرد</Button>
                  <Button size="sm" variant="ghost" onClick={() => setForm({ id: r.id, name: r.name, unit: r.unit, reorder: String(r.reorder_level), cost: String(r.cost_per_unit), active: r.is_active })}>تعديل</Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {receiveFor && <ReceiveDialog m={receiveFor} onClose={() => setReceiveFor(null)} onDone={() => { setReceiveFor(null); load(); }} />}
      {adjustFor && <AdjustDialog m={adjustFor} onClose={() => setAdjustFor(null)} onDone={() => { setAdjustFor(null); load(); }} />}
    </div>
  );
}

function ReceiveDialog({ m, onClose, onDone }: { m: MfgMaterial; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState(String(m.cost_per_unit || ''));
  const [pm, setPm] = useState<'cash' | 'card'>('cash');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function submit() {
    if (!(Number(qty) > 0)) { toast.error('أدخل كمية'); return; }
    setBusy(true);
    try { await mfgApi.receiveMaterial(m.id, Number(qty), Number(cost) || 0, pm, null); toast.success('تم التوريد'); onDone(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open onClose={onClose} title={`توريد: ${m.name}`} footer={<><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button onClick={submit} loading={busy}>توريد</Button></>}>
      <div className="space-y-3">
        <Field label={`الكمية (${m.unit})`}><Input type="number" step="0.001" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus /></Field>
        <Field label="تكلفة الوحدة"><Input type="number" step="0.0001" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
        <Field label="طريقة الدفع">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={pm === 'cash' ? 'primary' : 'outline'} onClick={() => setPm('cash')}>نقدًا</Button>
            <Button type="button" size="sm" variant={pm === 'card' ? 'primary' : 'outline'} onClick={() => setPm('card')}>شبكة</Button>
          </div>
        </Field>
      </div>
    </Dialog>
  );
}

function AdjustDialog({ m, onClose, onDone }: { m: MfgMaterial; onClose: () => void; onDone: () => void }) {
  const [newQty, setNewQty] = useState(String(m.current_qty));
  const [reason, setReason] = useState<'adjustment' | 'waste'>('adjustment');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function submit() {
    setBusy(true);
    try { await mfgApi.adjustMaterial(m.id, Number(newQty) || 0, reason, null); toast.success('تم'); onDone(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open onClose={onClose} title={`جرد/هدر: ${m.name}`} footer={<><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button onClick={submit} loading={busy}>حفظ</Button></>}>
      <div className="space-y-3">
        <p className="text-sm text-muted">المتوفّر: <strong>{num(m.current_qty)} {m.unit}</strong></p>
        <Field label={`الكمية الفعلية (${m.unit})`}><Input type="number" step="0.001" value={newQty} onChange={(e) => setNewQty(e.target.value)} autoFocus /></Field>
        <Field label="السبب">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={reason === 'adjustment' ? 'primary' : 'outline'} onClick={() => setReason('adjustment')}>تصحيح</Button>
            <Button type="button" size="sm" variant={reason === 'waste' ? 'primary' : 'outline'} onClick={() => setReason('waste')}>هدر</Button>
          </div>
        </Field>
      </div>
    </Dialog>
  );
}
