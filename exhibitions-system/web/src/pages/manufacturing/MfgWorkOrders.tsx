import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Plus } from 'lucide-react';
import { mfgApi } from '../../lib/api';
import type { MfgProduct, MfgWorkOrderRow, MfgWorkOrderDetail, MfgEstimate, MfgMaterial, WorkCenter } from '../../lib/types';
import { Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Spinner, Table, useToast } from '../../components/ui';

import { money } from '../../lib/format';
const statusLabel: Record<string, string> = {
  quote: 'عرض سعر', released: 'صادر', in_progress: 'قيد التنفيذ', done: 'منجز', invoiced: 'مفوتر', cancelled: 'ملغى',
};

export default function MfgWorkOrders() {
  const [rows, setRows] = useState<MfgWorkOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await mfgApi.woList(null)); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader title="أوامر الشغل" subtitle="عرض سعر ← إصدار ← تنفيذ ← إنجاز ← فوترة" icon={<ClipboardList size={22} />} />
      <div className="mb-4"><Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>أمر / عرض سعر جديد</Button></div>

      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState message="لا أوامر بعد." /> : (
        <Table head={<><th>الرقم</th><th>المنتج</th><th>الكمية</th><th>العميل</th><th>السعر</th><th>الحالة</th><th></th></>}>
          {rows.map((o) => (
            <tr key={o.id}>
              <td className="font-mono text-xs">{o.wo_no}</td>
              <td className="font-semibold">{o.product}</td>
              <td>{o.qty}</td>
              <td className="text-muted">{o.customer || '—'}</td>
              <td className="text-gold">{money(o.price)}</td>
              <td>{statusLabel[o.status] || o.status}</td>
              <td><Button size="sm" variant="ghost" onClick={() => setOpenId(o.id)}>تفاصيل</Button></td>
            </tr>
          ))}
        </Table>
      )}

      {creating && <CreateDialog onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} />}
      {openId && <DetailDialog id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}

function CreateDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [products, setProducts] = useState<MfgProduct[]>([]);
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [customer, setCustomer] = useState('');
  const [markup, setMarkup] = useState('30');
  const [est, setEst] = useState<MfgEstimate | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => { mfgApi.productsList().then(setProducts).catch((e) => toast.error((e as Error).message)); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    if (!productId) { setEst(null); return; }
    mfgApi.estimate(productId, Number(qty) || 0, Number(markup) || 0).then(setEst).catch(() => setEst(null));
  }, [productId, qty, markup]);

  async function create() {
    if (!productId) { toast.error('اختر المنتج'); return; }
    setBusy(true);
    try {
      await mfgApi.woCreate(productId, Number(qty) || 1, customer.trim() || null, Number(markup) || 0, null);
      toast.success('تم إنشاء الأمر');
      onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Dialog open onClose={onClose} title="أمر شغل / عرض سعر جديد" footer={<><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button onClick={create} loading={busy}>إنشاء</Button></>}>
      <div className="space-y-3">
        <Field label="المنتج">
          <select className="ax-select" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">— اختر —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الكمية"><Input type="number" step="0.001" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          <Field label="هامش الربح %"><Input type="number" step="0.1" value={markup} onChange={(e) => setMarkup(e.target.value)} /></Field>
        </div>
        <Field label="العميل (اختياري)"><Input value={customer} onChange={(e) => setCustomer(e.target.value)} /></Field>
        {est && (
          <Card>
            <div className="space-y-1 text-sm">
              <Row label="المواد" v={est.material} />
              <Row label="العمالة" v={est.labor} />
              <Row label="الأوفرهيد" v={est.overhead} />
              <div className="flex justify-between border-t border-white/10 pt-1 font-bold"><span>التكلفة</span><span>{money(est.cost)}</span></div>
              <div className="flex justify-between text-base font-extrabold text-gold"><span>السعر المقترح</span><span>{money(est.price)}</span></div>
            </div>
          </Card>
        )}
      </div>
    </Dialog>
  );
}

function Row({ label, v }: { label: string; v: number }) {
  return <div className="flex justify-between text-muted"><span>{label}</span><span>{money(v)}</span></div>;
}

function DetailDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<MfgWorkOrderDetail | null>(null);
  const [materials, setMaterials] = useState<MfgMaterial[]>([]);
  const [wcs, setWcs] = useState<WorkCenter[]>([]);
  const [loading, setLoading] = useState(true);
  // issue material
  const [imMat, setImMat] = useState(''); const [imQty, setImQty] = useState('');
  // log labor
  const [lbWc, setLbWc] = useState(''); const [lbOp, setLbOp] = useState(''); const [lbMin, setLbMin] = useState(''); const [lbRate, setLbRate] = useState('');
  const [prod, setProd] = useState(''); const [scrap, setScrap] = useState('');
  const toast = useToast();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [det, mats, w] = await Promise.all([mfgApi.woDetail(id), mfgApi.materialsList(false), mfgApi.workCentersList()]);
      setD(det); setMaterials(mats); setWcs(w);
    } catch (e) { toast.error((e as Error).message); } finally { setLoading(false); }
  }, [id, toast]);
  useEffect(() => { reload(); }, [reload]);

  async function status(s: 'released' | 'done' | 'cancelled') {
    try { await mfgApi.woSetStatus(id, s); toast.success('تم'); reload(); onChanged(); } catch (e) { toast.error((e as Error).message); }
  }
  async function issue() {
    if (!imMat || !(Number(imQty) > 0)) { toast.error('اختر مادة وكمية'); return; }
    try { await mfgApi.woIssueMaterial(id, imMat, Number(imQty)); setImMat(''); setImQty(''); toast.success('صُرفت المادة'); reload(); } catch (e) { toast.error((e as Error).message); }
  }
  async function logLabor() {
    if (!(Number(lbMin) > 0)) { toast.error('أدخل الدقائق'); return; }
    try { await mfgApi.woLogLabor(id, lbWc || null, lbOp.trim() || 'عمل', Number(lbMin), Number(lbRate) || 0); setLbOp(''); setLbMin(''); setLbRate(''); toast.success('سُجّلت العمالة'); reload(); } catch (e) { toast.error((e as Error).message); }
  }
  async function invoice(pm: 'cash' | 'card' | 'credit') {
    try { await mfgApi.woInvoice(id, pm); toast.success('تمت الفوترة'); reload(); onChanged(); } catch (e) { toast.error((e as Error).message); }
  }
  async function recordOutput() {
    try { await mfgApi.woRecordOutput(id, Number(prod) || 0, Number(scrap) || 0); toast.success('تم تسجيل الإنتاج'); reload(); } catch (e) { toast.error((e as Error).message); }
  }

  if (loading || !d) return <Dialog open onClose={onClose} title="..."><Spinner /></Dialog>;
  const active = d.status === 'released' || d.status === 'in_progress';

  return (
    <Dialog open onClose={onClose} title={`${d.wo_no} — ${d.product} ×${d.qty}`} size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-surface-2 px-3 py-1 font-bold">{statusLabel[d.status]}</span>
          {d.customer && <span className="text-muted">العميل: {d.customer}</span>}
          <span className="text-muted">هامش {d.markup_pct}%</span>
        </div>

        {/* مقدّر مقابل فعلي */}
        <Card>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div></div><div className="text-center font-bold text-muted">مقدّر</div><div className="text-center font-bold text-muted">فعلي</div>
            <Cmp label="المواد" e={d.est.material} a={d.actual.material} />
            <Cmp label="العمالة" e={d.est.labor} a={d.actual.labor} />
            <Cmp label="الأوفرهيد" e={d.est.overhead} a={d.actual.overhead} />
            <Cmp label="الإجمالي" e={d.est.total} a={d.actual.total} bold />
          </div>
          <div className="mt-2 flex justify-between border-t border-white/10 pt-2 font-extrabold">
            <span className="text-text">السعر</span><span className="text-gold">{money(d.est.price)}</span>
          </div>
        </Card>

        {/* إجراءات حسب الحالة */}
        {d.status === 'quote' && (
          <div className="flex gap-2">
            <Button onClick={() => status('released')}>إصدار الأمر</Button>
            <Button variant="danger" onClick={() => status('cancelled')}>إلغاء</Button>
          </div>
        )}

        {active && (
          <>
            <Card>
              <h4 className="mb-2 text-sm font-bold text-text">صرف مادة</h4>
              <div className="flex flex-wrap items-end gap-2">
                <select className="ax-select flex-1" value={imMat} onChange={(e) => setImMat(e.target.value)}>
                  <option value="">— مادة —</option>
                  {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.current_qty} {m.unit})</option>)}
                </select>
                <Input type="number" step="0.001" className="w-28" placeholder="كمية" value={imQty} onChange={(e) => setImQty(e.target.value)} />
                <Button size="sm" onClick={issue}>صرف</Button>
              </div>
            </Card>
            <Card>
              <h4 className="mb-2 text-sm font-bold text-text">تسجيل عمالة</h4>
              <div className="grid grid-cols-12 items-end gap-2">
                <Input className="col-span-3" placeholder="العملية" value={lbOp} onChange={(e) => setLbOp(e.target.value)} />
                <select className="ax-select col-span-3" value={lbWc} onChange={(e) => setLbWc(e.target.value)}>
                  <option value="">— محطة —</option>
                  {wcs.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                <Input className="col-span-2" type="number" placeholder="دقائق" value={lbMin} onChange={(e) => setLbMin(e.target.value)} />
                <Input className="col-span-2" type="number" placeholder="أجر/س" value={lbRate} onChange={(e) => setLbRate(e.target.value)} />
                <Button size="sm" className="col-span-2" onClick={logLabor}>تسجيل</Button>
              </div>
            </Card>
            <Card>
              <h4 className="mb-2 text-sm font-bold text-text">تسجيل الإنتاج / الهدر</h4>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="المنتَج"><Input type="number" step="0.001" className="w-28" value={prod} onChange={(e) => setProd(e.target.value)} placeholder={String(d.produced_qty)} /></Field>
                <Field label="الهدر/التالف"><Input type="number" step="0.001" className="w-28" value={scrap} onChange={(e) => setScrap(e.target.value)} placeholder={String(d.scrap_qty)} /></Field>
                <Button size="sm" onClick={recordOutput}>حفظ</Button>
                <span className="text-xs text-muted">المسجّل: {d.produced_qty} منتَج / {d.scrap_qty} هدر</span>
              </div>
            </Card>
            <Button onClick={() => status('done')}>إنجاز الأمر</Button>
          </>
        )}

        {d.status === 'done' && (
          <Card>
            <h4 className="mb-2 text-sm font-bold text-text">فوترة — {money(d.est.price)}</h4>
            <div className="flex gap-2">
              <Button onClick={() => invoice('cash')}>نقدًا</Button>
              <Button variant="outline" onClick={() => invoice('card')}>شبكة</Button>
              <Button variant="outline" onClick={() => invoice('credit')}>آجل</Button>
            </div>
          </Card>
        )}

        {/* سجل */}
        {d.materials.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-bold text-muted">المواد المصروفة</h4>
            {d.materials.map((m, i) => <div key={i} className="flex justify-between text-sm"><span>{m.qty} × {m.name}</span><span className="text-gold">{money(m.cost)}</span></div>)}
          </div>
        )}
        {d.labor.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-bold text-muted">العمالة المسجّلة</h4>
            {d.labor.map((l, i) => <div key={i} className="flex justify-between text-sm"><span>{l.operation} — {l.minutes} د</span><span className="text-gold">{money(l.labor + l.overhead)}</span></div>)}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function Cmp({ label, e, a, bold }: { label: string; e: number; a: number; bold?: boolean }) {
  return (
    <>
      <div className={`text-muted ${bold ? 'font-bold text-text' : ''}`}>{label}</div>
      <div className={`text-center ${bold ? 'font-bold' : 'text-muted'}`}>{money(e)}</div>
      <div className={`text-center ${bold ? 'font-bold' : ''} ${a > e ? 'text-danger' : 'text-success'}`}>{money(a)}</div>
    </>
  );
}
