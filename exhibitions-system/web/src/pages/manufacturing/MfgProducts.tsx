import { useEffect, useState } from 'react';
import { Package, Plus, Trash2, Layers, Workflow as WorkflowIcon } from 'lucide-react';
import { mfgApi } from '../../lib/api';
import type { MfgProduct, MfgMaterial, WorkCenter, MfgRoutingOp } from '../../lib/types';
import { Button, Card, CardHeader, Dialog, EmptyState, Field, Input, PageHeader, Spinner, useToast } from '../../components/ui';

const empty = { id: null as string | null, name: '', unit: 'قطعة', active: true };

export default function MfgProducts() {
  const [rows, setRows] = useState<MfgProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...empty });
  const [saving, setSaving] = useState(false);
  const [bomFor, setBomFor] = useState<MfgProduct | null>(null);
  const [routeFor, setRouteFor] = useState<MfgProduct | null>(null);
  const toast = useToast();

  async function load() {
    setLoading(true);
    try { setRows(await mfgApi.productsList()); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await mfgApi.setProduct(form.id, form.name.trim(), form.unit.trim() || 'قطعة', form.active);
      toast.success(form.id ? 'تم التعديل' : 'تمت الإضافة');
      setForm({ ...empty });
      load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }
  async function del(id: string) {
    if (!confirm('حذف المنتج؟')) return;
    try { await mfgApi.deleteProduct(id); load(); } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div>
      <PageHeader title="منتجات التصنيع" subtitle="المنتجات وقوائم موادها (BOM) ومساراتها" icon={<Package size={22} />} />
      <form onSubmit={save} className="mb-6">
        <Card>
          <CardHeader title={form.id ? 'تعديل منتج' : 'منتج جديد'} icon={<Plus size={18} />} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="اسم المنتج"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="الوحدة"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Field>
            <div className="flex items-end gap-2">
              <Button type="submit" className="flex-1" loading={saving}>{form.id ? 'حفظ' : 'إضافة'}</Button>
              {form.id && <Button type="button" variant="ghost" onClick={() => setForm({ ...empty })}>إلغاء</Button>}
            </div>
          </div>
        </Card>
      </form>
      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState message="لا منتجات بعد." /> : (
        <div className="grid gap-2 sm:grid-cols-2">
          {rows.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-white/8 p-3">
              <span className="font-bold text-text">{p.name} <span className="text-[11px] text-muted">/ {p.unit}</span></span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" icon={<Layers size={14} />} onClick={() => setBomFor(p)}>المواد</Button>
                <Button size="sm" variant="outline" icon={<WorkflowIcon size={14} />} onClick={() => setRouteFor(p)}>المسار</Button>
                <Button size="sm" variant="ghost" onClick={() => setForm({ id: p.id, name: p.name, unit: p.unit, active: p.is_active })}>تعديل</Button>
                <button className="p-1 text-danger" onClick={() => del(p.id)}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {bomFor && <BomDialog product={bomFor} onClose={() => setBomFor(null)} />}
      {routeFor && <RoutingDialog product={routeFor} onClose={() => setRouteFor(null)} />}
    </div>
  );
}

function BomDialog({ product, onClose }: { product: MfgProduct; onClose: () => void }) {
  const [materials, setMaterials] = useState<MfgMaterial[]>([]);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    (async () => {
      try {
        const [mats, bom] = await Promise.all([mfgApi.materialsList(false), mfgApi.bomGet(product.id)]);
        setMaterials(mats);
        const m: Record<string, string> = {};
        bom.forEach((b) => { m[b.material_id] = String(b.qty); });
        setQtys(m);
      } catch (e) { toast.error((e as Error).message); } finally { setLoading(false); }
    })();
    /* eslint-disable-next-line */
  }, [product.id]);
  async function save() {
    setBusy(true);
    try {
      const items = Object.entries(qtys).map(([material_id, q]) => ({ material_id, qty: Number(q) || 0 })).filter((x) => x.qty > 0);
      await mfgApi.bomSet(product.id, items);
      toast.success('تم حفظ المواد');
      onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open onClose={onClose} title={`مواد: ${product.name}`} footer={<><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button onClick={save} loading={busy}>حفظ</Button></>}>
      <p className="mb-3 text-xs text-muted">كمية كل مادة لإنتاج وحدة واحدة.</p>
      {loading ? <Spinner /> : materials.length === 0 ? <p className="text-sm text-muted">أضِف مواد أولًا.</p> : (
        <div className="space-y-2">
          {materials.map((mat) => (
            <div key={mat.id} className="flex items-center justify-between gap-3">
              <span className="text-sm text-text">{mat.name} <span className="text-[11px] text-muted">({mat.unit})</span></span>
              <Input type="number" step="0.001" className="w-28" placeholder="0" value={qtys[mat.id] ?? ''} onChange={(e) => setQtys((m) => ({ ...m, [mat.id]: e.target.value }))} />
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

interface RouteRow { operation: string; work_center_id: string; run_minutes: string; labor_rate: string }

function RoutingDialog({ product, onClose }: { product: MfgProduct; onClose: () => void }) {
  const [wcs, setWcs] = useState<WorkCenter[]>([]);
  const [ops, setOps] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    (async () => {
      try {
        const [w, r] = await Promise.all([mfgApi.workCentersList(), mfgApi.routingGet(product.id)]);
        setWcs(w);
        setOps((r as MfgRoutingOp[]).map((x) => ({ operation: x.operation, work_center_id: x.work_center_id || '', run_minutes: String(x.run_minutes), labor_rate: String(x.labor_rate) })));
      } catch (e) { toast.error((e as Error).message); } finally { setLoading(false); }
    })();
    /* eslint-disable-next-line */
  }, [product.id]);
  function add() { setOps((o) => [...o, { operation: '', work_center_id: '', run_minutes: '0', labor_rate: '0' }]); }
  function upd(i: number, k: keyof RouteRow, v: string) { setOps((o) => o.map((r, idx) => (idx === i ? { ...r, [k]: v } : r))); }
  async function save() {
    setBusy(true);
    try {
      await mfgApi.routingSet(product.id, ops.filter((o) => o.operation.trim()).map((o) => ({
        operation: o.operation.trim(), work_center_id: o.work_center_id || null, run_minutes: Number(o.run_minutes) || 0, labor_rate: Number(o.labor_rate) || 0,
      })));
      toast.success('تم حفظ المسار');
      onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open onClose={onClose} title={`مسار التصنيع: ${product.name}`} size="lg" footer={<><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button onClick={save} loading={busy}>حفظ</Button></>}>
      <p className="mb-3 text-xs text-muted">العمليات بالترتيب: لكل عملية محطة وزمن (دقائق) وأجر ساعة العامل.</p>
      {loading ? <Spinner /> : (
        <div className="space-y-2">
          {ops.map((o, i) => (
            <div key={i} className="grid grid-cols-12 items-center gap-2">
              <Input className="col-span-4" placeholder="العملية (قص/لحام...)" value={o.operation} onChange={(e) => upd(i, 'operation', e.target.value)} />
              <select className="ax-select col-span-3" value={o.work_center_id} onChange={(e) => upd(i, 'work_center_id', e.target.value)}>
                <option value="">— المحطة —</option>
                {wcs.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <Input className="col-span-2" type="number" step="0.1" placeholder="دقائق" value={o.run_minutes} onChange={(e) => upd(i, 'run_minutes', e.target.value)} />
              <Input className="col-span-2" type="number" step="0.01" placeholder="أجر/س" value={o.labor_rate} onChange={(e) => upd(i, 'labor_rate', e.target.value)} />
              <button className="col-span-1 p-1 text-danger" onClick={() => setOps((x) => x.filter((_, idx) => idx !== i))}><Trash2 size={15} /></button>
            </div>
          ))}
          <Button size="sm" variant="outline" icon={<Plus size={14} />} onClick={add}>إضافة عملية</Button>
        </div>
      )}
    </Dialog>
  );
}
