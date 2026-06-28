import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScanLine,
  Trash2,
  Banknote,
  CreditCard,
  CheckCircle2,
  Plus,
  Printer,
  Search,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import { useAdminAuth } from '../../context/AdminAuthContext';
import type { Branch, ProductPublic } from '../../lib/types';
import { Button, Card, Field, PageHeader, Select, Spinner, useToast } from '../../components/ui';
import { sar } from '../../lib/format';

interface CartLine {
  product_id: string;
  uom_id: string | null;
  name: string;
  code: string;
  qty: number;
  unit_price: number;
}

interface Receipt {
  ref: string;
  when: string;
  items: { name: string; qty: number; unit_price: number }[];
  total: number;
  paid: number | null;
  change: number | null;
  payment: 'cash' | 'card';
}

export default function AdminCashier() {
  const { profile } = useAdminAuth();
  const brand = profile?.tenant?.brand_name || profile?.tenant?.name || 'فاتورة';

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [products, setProducts] = useState<ProductPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<'cash' | 'card'>('cash');
  const [paid, setPaid] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<Receipt | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    Promise.all([
      supabase.from('branches').select('id,name,location,status,target_amount_sar').order('name'),
      supabase
        .from('products_public')
        .select('id,product_code,name,category_id,sale_price_ref,is_active')
        .order('name'),
    ]).then(([b, p]) => {
      const bs = (b.data as Branch[]) || [];
      setBranches(bs);
      if (bs.length >= 1) setBranchId(bs[0].id);
      setProducts(((p.data as ProductPublic[]) || []).filter((x) => x.is_active));
      setLoading(false);
      setTimeout(() => scanRef.current?.focus(), 100);
    });
  }, []);

  const total = useMemo(() => cart.reduce((s, l) => s + l.qty * l.unit_price, 0), [cart]);
  const change = useMemo(() => {
    const p = Number(paid);
    return payment === 'cash' && p > 0 ? p - total : null;
  }, [paid, total, payment]);

  // اقتراحات البحث بالاسم/الكود (عندما لا يكون مسحًا صرفًا)
  const suggestions = useMemo(() => {
    const q = code.trim().toLowerCase();
    if (q.length < 2) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.product_code.toLowerCase().includes(q))
      .slice(0, 8);
  }, [code, products]);

  function addLine(p: { id: string; name: string; code: string; price: number; uom_id?: string | null }) {
    setCart((cur) => {
      const idx = cur.findIndex((l) => l.product_id === p.id && l.uom_id === (p.uom_id ?? null));
      if (idx >= 0) {
        const next = [...cur];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [
        ...cur,
        { product_id: p.id, uom_id: p.uom_id ?? null, name: p.name, code: p.code, qty: 1, unit_price: p.price },
      ];
    });
  }

  async function submitScan(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim();
    if (!c) return;
    // إن كان هناك اقتراح واحد بالاسم ولا يطابق كودًا، أضِفه مباشرة
    setScanning(true);
    try {
      const p = await adminApi.posLookup(c);
      if (p) {
        addLine({ id: p.id, name: p.name, code: p.product_code, price: p.sale_price_ref || 0, uom_id: p.uom_id });
        setCode('');
      } else if (suggestions.length === 1) {
        const s = suggestions[0];
        addLine({ id: s.id, name: s.name, code: s.product_code, price: s.sale_price_ref || 0 });
        setCode('');
      } else if (suggestions.length === 0) {
        toast.error(`لم يُعثر على صنف بـ «${c}»`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setScanning(false);
      scanRef.current?.focus();
    }
  }

  function pickSuggestion(p: ProductPublic) {
    addLine({ id: p.id, name: p.name, code: p.product_code, price: p.sale_price_ref || 0 });
    setCode('');
    scanRef.current?.focus();
  }

  function update(i: number, patch: Partial<CartLine>) {
    setCart((c) => c.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function remove(i: number) {
    setCart((c) => c.filter((_, idx) => idx !== i));
  }

  function printReceipt(r: Receipt) {
    const w = window.open('', '_blank', 'width=340,height=640');
    if (!w) {
      toast.error('اسمح بالنوافذ المنبثقة لطباعة الإيصال');
      return;
    }
    const rows = r.items
      .map(
        (it) =>
          `<tr><td>${it.name}</td><td style="text-align:center">${it.qty}×${it.unit_price}</td><td style="text-align:left">${sar(
            it.qty * it.unit_price
          )}</td></tr>`
      )
      .join('');
    const payLabel = r.payment === 'card' ? 'شبكة' : 'نقدًا';
    w.document.write(
      `<html dir="rtl"><head><meta charset="utf-8"><title>إيصال</title>
      <style>
        *{font-family:'Courier New',monospace;box-sizing:border-box}
        body{width:80mm;margin:0;padding:8px;color:#000}
        h2{text-align:center;margin:2px 0;font-size:16px}
        .c{text-align:center;font-size:11px}
        table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}
        td{padding:2px 0;vertical-align:top}
        .sep{border-top:1px dashed #000;margin:6px 0}
        .row{display:flex;justify-content:space-between;font-size:13px;padding:1px 0}
        .big{font-size:15px;font-weight:bold}
      </style></head><body>
      <h2>${brand}</h2>
      <div class="c">${r.when}</div>
      <div class="c">فاتورة: ${r.ref}</div>
      <div class="sep"></div>
      <table>${rows}</table>
      <div class="sep"></div>
      <div class="row big"><span>الإجمالي</span><span>${sar(r.total)}</span></div>
      <div class="row"><span>الدفع</span><span>${payLabel}</span></div>
      ${r.paid != null ? `<div class="row"><span>المدفوع</span><span>${sar(r.paid)}</span></div>` : ''}
      ${r.change != null ? `<div class="row"><span>الباقي</span><span>${sar(r.change)}</span></div>` : ''}
      <div class="sep"></div>
      <div class="c">شكرًا لزيارتكم</div>
      <script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)}</script>
      </body></html>`
    );
    w.document.close();
  }

  async function checkout(printAfter: boolean) {
    if (!branchId) return toast.error('اختر المتجر');
    if (cart.length === 0) return toast.error('السلة فارغة');
    setBusy(true);
    try {
      const res = await adminApi.posSale(
        branchId,
        payment,
        cart.map((l) => ({ product_id: l.product_id, qty: l.qty, unit_price: l.unit_price, uom_id: l.uom_id }))
      );
      const rcpt: Receipt = {
        ref: String(res.sale_id).slice(0, 8),
        when: new Date().toLocaleString('ar'),
        items: cart.map((l) => ({ name: l.name, qty: l.qty, unit_price: l.unit_price })),
        total: res.total,
        paid: payment === 'cash' && Number(paid) > 0 ? Number(paid) : null,
        change: change != null && change >= 0 ? change : null,
        payment,
      };
      setLastReceipt(rcpt);
      if (printAfter) printReceipt(rcpt);
      toast.success(`تم البيع — ${sar(res.total)}`);
      setCart([]);
      setPaid('');
      scanRef.current?.focus();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="الكاشير"
        subtitle="امسح الباركود أو ابحث بالاسم ثم أضف"
        icon={<ScanLine size={22} />}
        action={
          branches.length > 1 ? (
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-44">
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />

      {branches.length === 0 && (
        <Card className="mb-5 border-warning/30 bg-warning/5 text-sm text-warning">
          لا يوجد متجر بعد — أنشئ متجرًا من «المتجر/الفروع» أولًا.
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <form onSubmit={submitScan} className="relative mb-4 flex gap-2">
              <div className="relative flex-1">
                <Search size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-primary-hover" />
                <input
                  ref={scanRef}
                  className="ax-input w-full pr-10 text-lg"
                  placeholder="امسح باركود أو اكتب الاسم/الكود ثم Enter"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                {suggestions.length > 0 && (
                  <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-white/10 bg-bg-2 shadow-xl">
                    {suggestions.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => pickSuggestion(p)}
                        className="flex w-full items-center justify-between gap-2 border-b border-white/5 px-3 py-2 text-right text-sm transition last:border-0 hover:bg-primary/10"
                      >
                        <span className="flex items-center gap-2">
                          <Plus size={13} className="text-primary-hover" />
                          <span className="font-medium text-text">{p.name}</span>
                          <span className="font-mono text-xs text-muted">({p.product_code})</span>
                        </span>
                        <span className="text-gold">{sar(p.sale_price_ref || 0)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button type="submit" icon={<Plus size={16} />} loading={scanning}>
                إضافة
              </Button>
            </form>

            {cart.length === 0 ? (
              <p className="py-10 text-center text-muted">السلة فارغة — امسح صنفًا أو ابحث بالاسم</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="ax-table">
                  <thead>
                    <tr>
                      <th>الصنف</th>
                      <th>الكمية</th>
                      <th>السعر</th>
                      <th>الإجمالي</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((l, i) => (
                      <tr key={`${l.product_id}-${l.uom_id}`}>
                        <td className="font-semibold">
                          {l.name} <span className="font-mono text-xs text-muted">({l.code})</span>
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            className="ax-input w-20"
                            value={l.qty}
                            onChange={(e) => update(i, { qty: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="ax-input w-24"
                            value={l.unit_price}
                            onChange={(e) => update(i, { unit_price: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        </td>
                        <td className="font-bold text-gold">{sar(l.qty * l.unit_price)}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => remove(i)}
                            className="rounded-lg p-1.5 text-danger transition hover:bg-danger/10"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div>
          <Card className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-muted">الإجمالي</span>
              <span className="text-2xl font-bold text-gold">{sar(total)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant={payment === 'cash' ? 'primary' : 'outline'} icon={<Banknote size={16} />} onClick={() => setPayment('cash')}>
                نقدًا
              </Button>
              <Button variant={payment === 'card' ? 'primary' : 'outline'} icon={<CreditCard size={16} />} onClick={() => setPayment('card')}>
                شبكة
              </Button>
            </div>

            {payment === 'cash' && (
              <>
                <Field label="المبلغ المدفوع">
                  <input
                    type="number"
                    step="0.01"
                    className="ax-input w-full text-lg"
                    value={paid}
                    onChange={(e) => setPaid(e.target.value)}
                    placeholder="0"
                  />
                </Field>
                {change != null && (
                  <div
                    className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                      change >= 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                    }`}
                  >
                    <span>{change >= 0 ? 'الباقي' : 'ناقص'}</span>
                    <span className="font-bold">{sar(Math.abs(change))}</span>
                  </div>
                )}
              </>
            )}

            <div className="space-y-2">
              <Button
                className="w-full"
                icon={<Printer size={18} />}
                loading={busy}
                disabled={cart.length === 0 || !branchId}
                onClick={() => checkout(true)}
              >
                إتمام البيع + طباعة
              </Button>
              <Button
                className="w-full"
                variant="outline"
                icon={<CheckCircle2 size={16} />}
                loading={busy}
                disabled={cart.length === 0 || !branchId}
                onClick={() => checkout(false)}
              >
                إتمام بلا طباعة
              </Button>
            </div>

            {lastReceipt && (
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center text-sm">
                <div className="mb-1 text-muted">
                  آخر عملية: {sar(lastReceipt.total)}
                  {lastReceipt.change != null && ` · الباقي ${sar(lastReceipt.change)}`}
                </div>
                <Button size="sm" variant="ghost" icon={<Printer size={14} />} onClick={() => printReceipt(lastReceipt)}>
                  إعادة طباعة الإيصال
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
