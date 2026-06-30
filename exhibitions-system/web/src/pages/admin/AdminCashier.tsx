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
  Pause,
  RotateCcw,
  Lock,
  Unlock,
  Percent,
  UserPlus,
  Layers,
  Scale,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import { useAdminAuth } from '../../context/AdminAuthContext';
import type {
  Branch,
  ProductPublic,
  GroceryShift,
  HeldSale,
  PosSaleLookup,
  LoyaltyCustomer,
} from '../../lib/types';
import {
  Button,
  Card,
  Dialog,
  Field,
  PageHeader,
  Select,
  Spinner,
  useToast,
} from '../../components/ui';
import { sar } from '../../lib/format';

interface CartLine {
  product_id: string;
  uom_id: string | null;
  name: string;
  code: string;
  qty: number;
  unit_price: number;
  line_discount: number;
  is_weighed?: boolean;
}

interface Receipt {
  ref: string;
  when: string;
  items: { name: string; qty: number; unit_price: number; line_discount: number }[];
  subtotal: number;
  discount: number;
  total: number;
  cash: number;
  card: number;
  paid: number | null;
  change: number | null;
}

type PayMode = 'cash' | 'card' | 'split';

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

  // الدفع
  const [payMode, setPayMode] = useState<PayMode>('cash');
  const [cardAmount, setCardAmount] = useState('');
  const [paid, setPaid] = useState('');
  const [invoiceDiscount, setInvoiceDiscount] = useState('');

  // الولاء
  const [loyaltyPhone, setLoyaltyPhone] = useState('');
  const [customer, setCustomer] = useState<LoyaltyCustomer | null>(null);
  const [redeemPoints, setRedeemPoints] = useState('');
  const [loyaltyBusy, setLoyaltyBusy] = useState(false);

  const [busy, setBusy] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<Receipt | null>(null);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);

  // الوردية
  const [shift, setShift] = useState<GroceryShift | null>(null);
  const [openDlg, setOpenDlg] = useState(false);
  const [closeDlg, setCloseDlg] = useState(false);
  const [openFloat, setOpenFloat] = useState('');
  const [declaredCash, setDeclaredCash] = useState('');
  const [shiftBusy, setShiftBusy] = useState(false);

  // المرتجعات
  const [returnDlg, setReturnDlg] = useState(false);
  const [returnRef, setReturnRef] = useState('');
  const [returnData, setReturnData] = useState<PosSaleLookup | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [returnMethod, setReturnMethod] = useState<'cash' | 'card'>('cash');
  const [returnBusy, setReturnBusy] = useState(false);

  // التعليق/الاستئناف
  const [heldDlg, setHeldDlg] = useState(false);
  const [held, setHeld] = useState<HeldSale[]>([]);

  const scanRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    Promise.all([
      supabase.from('branches').select('id,name,location,status,target_amount_sar').order('name'),
      supabase
        .from('products_public')
        .select('id,product_code,name,category_id,sale_price_ref,is_active')
        .order('name'),
      adminApi.gposShiftCurrent().catch(() => null),
    ]).then(([b, p, sh]) => {
      const bs = (b.data as Branch[]) || [];
      setBranches(bs);
      if (bs.length >= 1) setBranchId(bs[0].id);
      setProducts(((p.data as ProductPublic[]) || []).filter((x) => x.is_active));
      setShift(sh as GroceryShift | null);
      setLoading(false);
      setTimeout(() => scanRef.current?.focus(), 100);
    });
  }, []);

  /* ---------------- الحسابات ---------------- */
  const subtotal = useMemo(
    () => cart.reduce((s, l) => s + l.qty * l.unit_price, 0),
    [cart]
  );
  const lineDiscounts = useMemo(
    () => cart.reduce((s, l) => s + (l.line_discount || 0), 0),
    [cart]
  );
  const invDisc = Math.max(0, Number(invoiceDiscount) || 0);
  const redeemVal = useMemo(() => {
    const pts = Math.max(0, Math.floor(Number(redeemPoints) || 0));
    if (!customer || !customer.enabled || pts <= 0) return 0;
    const cap = Math.min(pts, customer.points);
    return Math.min(cap * customer.redeem_value, subtotal - lineDiscounts - invDisc);
  }, [redeemPoints, customer, subtotal, lineDiscounts, invDisc]);

  const total = useMemo(
    () => Math.max(0, subtotal - lineDiscounts - invDisc - redeemVal),
    [subtotal, lineDiscounts, invDisc, redeemVal]
  );

  const card = useMemo(() => {
    if (payMode === 'card') return total;
    if (payMode === 'split') return Math.min(Math.max(0, Number(cardAmount) || 0), total);
    return 0;
  }, [payMode, total, cardAmount]);
  const cashDue = useMemo(() => Math.max(0, total - card), [total, card]);
  const change = useMemo(() => {
    const p = Number(paid);
    return (payMode === 'cash' || payMode === 'split') && p > 0 ? p - cashDue : null;
  }, [paid, cashDue, payMode]);

  const suggestions = useMemo(() => {
    const q = code.trim().toLowerCase();
    if (q.length < 2) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.product_code.toLowerCase().includes(q))
      .slice(0, 8);
  }, [code, products]);

  /* ---------------- السلة ---------------- */
  function addLine(p: {
    id: string;
    name: string;
    code: string;
    price: number;
    uom_id?: string | null;
    qty?: number;
    is_weighed?: boolean;
  }) {
    setCart((cur) => {
      // موزون: أضِف سطرًا مستقلًا دائمًا (كمية لكل وزنة)
      if (p.is_weighed) {
        return [
          ...cur,
          {
            product_id: p.id,
            uom_id: p.uom_id ?? null,
            name: p.name,
            code: p.code,
            qty: p.qty ?? 1,
            unit_price: p.price,
            line_discount: 0,
            is_weighed: true,
          },
        ];
      }
      const idx = cur.findIndex((l) => l.product_id === p.id && l.uom_id === (p.uom_id ?? null) && !l.is_weighed);
      if (idx >= 0) {
        const next = [...cur];
        next[idx] = { ...next[idx], qty: next[idx].qty + (p.qty ?? 1) };
        return next;
      }
      return [
        ...cur,
        {
          product_id: p.id,
          uom_id: p.uom_id ?? null,
          name: p.name,
          code: p.code,
          qty: p.qty ?? 1,
          unit_price: p.price,
          line_discount: 0,
        },
      ];
    });
  }

  async function submitScan(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim();
    if (!c) return;
    setScanning(true);
    try {
      const p = await adminApi.posLookup(c);
      if (p) {
        addLine({
          id: p.id,
          name: p.name,
          code: p.product_code,
          price: p.sale_price_ref || 0,
          uom_id: p.uom_id,
          qty: p.is_weighed ? p.weighed_qty || 1 : 1,
          is_weighed: p.is_weighed,
        });
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
  function resetSale() {
    setCart([]);
    setPaid('');
    setCardAmount('');
    setInvoiceDiscount('');
    setRedeemPoints('');
    setCustomer(null);
    setLoyaltyPhone('');
    setPayMode('cash');
  }

  /* ---------------- الوردية ---------------- */
  async function doOpenShift() {
    setShiftBusy(true);
    try {
      const s = await adminApi.gposShiftOpen(Math.max(0, Number(openFloat) || 0));
      setShift(s);
      setOpenDlg(false);
      setOpenFloat('');
      toast.success('تم فتح الوردية');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setShiftBusy(false);
    }
  }
  async function doCloseShift() {
    setShiftBusy(true);
    try {
      const z = await adminApi.gposShiftClose(Math.max(0, Number(declaredCash) || 0), null);
      setShift(null);
      setCloseDlg(false);
      setDeclaredCash('');
      toast.success(
        `أُغلقت الوردية — متوقع ${sar(z.expected_cash)} · مُعلن ${sar(z.declared_cash || 0)} · فرق ${sar(z.variance || 0)}`
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setShiftBusy(false);
    }
  }

  /* ---------------- الولاء ---------------- */
  async function lookupLoyalty() {
    const ph = loyaltyPhone.trim();
    if (!ph) return;
    setLoyaltyBusy(true);
    try {
      const c = await adminApi.loyaltyCustomer(ph, null);
      setCustomer(c);
      if (!c.enabled) toast.error('برنامج الولاء غير مُفعّل');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoyaltyBusy(false);
    }
  }

  /* ---------------- التعليق/الاستئناف ---------------- */
  async function holdSale() {
    if (cart.length === 0) return toast.error('السلة فارغة');
    try {
      await adminApi.posHold(branchId, null, cart);
      toast.success('عُلّقت الفاتورة');
      resetSale();
      scanRef.current?.focus();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function openHeld() {
    try {
      const list = await adminApi.posHeldList();
      setHeld(list);
      setHeldDlg(true);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  function resumeHeld(h: HeldSale) {
    setCart((h.cart as CartLine[]) || []);
    adminApi.posHeldDelete(h.id).catch(() => {});
    setHeldDlg(false);
    scanRef.current?.focus();
  }

  /* ---------------- المرتجعات ---------------- */
  async function lookupReturn() {
    const ref = returnRef.trim() || lastSaleId || '';
    if (!ref) return toast.error('أدخل رقم الفاتورة');
    setReturnBusy(true);
    try {
      const d = await adminApi.posSaleLookup(ref);
      if (!d.sale) {
        toast.error('الفاتورة غير موجودة');
        setReturnData(null);
      } else {
        setReturnData(d);
        setReturnQty({});
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReturnBusy(false);
    }
  }
  async function doReturn() {
    if (!returnData?.sale) return;
    const items = returnData.items
      .map((it) => ({ sale_item_id: it.id, qty: returnQty[it.id] || 0 }))
      .filter((x) => x.qty > 0);
    if (items.length === 0) return toast.error('حدّد كميات الإرجاع');
    setReturnBusy(true);
    try {
      const res = await adminApi.posReturn(returnData.sale.id, items, returnMethod);
      toast.success(`تم الإرجاع — ${sar(res.refund)}`);
      setReturnDlg(false);
      setReturnData(null);
      setReturnRef('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReturnBusy(false);
    }
  }

  /* ---------------- الطباعة ---------------- */
  function printReceipt(r: Receipt) {
    const w = window.open('', '_blank', 'width=340,height=640');
    if (!w) {
      toast.error('اسمح بالنوافذ المنبثقة لطباعة الإيصال');
      return;
    }
    const rows = r.items
      .map(
        (it) =>
          `<tr><td>${it.name}${
            it.line_discount > 0 ? ` <small>(خصم ${sar(it.line_discount)})</small>` : ''
          }</td><td style="text-align:center">${it.qty}×${it.unit_price}</td><td style="text-align:left">${sar(
            it.qty * it.unit_price - it.line_discount
          )}</td></tr>`
      )
      .join('');
    w.document.write(
      `<html dir="rtl"><head><meta charset="utf-8"><title>إيصال</title>
      <style>
        *{font-family:'Courier New',monospace;box-sizing:border-box}
        body{width:80mm;margin:0;padding:8px;color:#000}
        h2{text-align:center;margin:2px 0;font-size:16px}
        .c{text-align:center;font-size:11px}
        small{font-size:9px}
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
      <div class="row"><span>المجموع</span><span>${sar(r.subtotal)}</span></div>
      ${r.discount > 0 ? `<div class="row"><span>الخصم</span><span>- ${sar(r.discount)}</span></div>` : ''}
      <div class="row big"><span>الإجمالي</span><span>${sar(r.total)}</span></div>
      ${r.cash > 0 ? `<div class="row"><span>نقدًا</span><span>${sar(r.cash)}</span></div>` : ''}
      ${r.card > 0 ? `<div class="row"><span>شبكة</span><span>${sar(r.card)}</span></div>` : ''}
      ${r.paid != null ? `<div class="row"><span>المدفوع</span><span>${sar(r.paid)}</span></div>` : ''}
      ${r.change != null ? `<div class="row"><span>الباقي</span><span>${sar(r.change)}</span></div>` : ''}
      <div class="sep"></div>
      <div class="c">شكرًا لزيارتكم</div>
      <script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)}</script>
      </body></html>`
    );
    w.document.close();
  }

  /* ---------------- إتمام البيع ---------------- */
  async function checkout(printAfter: boolean) {
    if (!branchId) return toast.error('اختر المتجر');
    if (!shift) return toast.error('افتح وردية أولًا');
    if (cart.length === 0) return toast.error('السلة فارغة');
    setBusy(true);
    try {
      const payments =
        card > 0 ? [{ method: 'card' as const, amount: card }] : [];
      const pts = Math.max(0, Math.floor(Number(redeemPoints) || 0));
      const res = await adminApi.posSale(
        branchId,
        cart.map((l) => ({
          product_id: l.product_id,
          qty: l.qty,
          unit_price: l.unit_price,
          uom_id: l.uom_id,
          line_discount: l.line_discount || 0,
        })),
        payments,
        invDisc,
        customer && pts > 0 ? customer.id : customer ? customer.id : null,
        customer && pts > 0 ? pts : 0
      );
      const rcpt: Receipt = {
        ref: String(res.sale_id).slice(0, 8),
        when: new Date().toLocaleString('ar'),
        items: cart.map((l) => ({
          name: l.name,
          qty: l.qty,
          unit_price: l.unit_price,
          line_discount: l.line_discount || 0,
        })),
        subtotal,
        discount: res.discount + lineDiscounts,
        total: res.total,
        cash: res.cash,
        card: res.card,
        paid: (payMode === 'cash' || payMode === 'split') && Number(paid) > 0 ? Number(paid) : null,
        change: change != null && change >= 0 ? change : null,
      };
      setLastReceipt(rcpt);
      setLastSaleId(res.sale_id);
      if (printAfter) printReceipt(rcpt);
      toast.success(`تم البيع — ${sar(res.total)}`);
      resetSale();
      // حدّث ملخّص الوردية
      adminApi.gposShiftCurrent().then((s) => setShift(s as GroceryShift | null)).catch(() => {});
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
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" icon={<RotateCcw size={14} />} onClick={() => setReturnDlg(true)}>
              مرتجع
            </Button>
            <Button size="sm" variant="outline" icon={<Layers size={14} />} onClick={openHeld}>
              المعلّقة
            </Button>
            {branches.length > 1 && (
              <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-40">
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
        }
      />

      {/* شريط الوردية */}
      <Card className="mb-5 flex flex-wrap items-center justify-between gap-3 py-3">
        {shift ? (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="flex items-center gap-1.5 font-semibold text-success">
                <Unlock size={15} /> وردية مفتوحة
              </span>
              <span className="text-muted">
                فواتير: <b className="text-text">{shift.bills}</b>
              </span>
              <span className="text-muted">
                مبيعات: <b className="text-gold">{sar(shift.sales)}</b>
              </span>
              <span className="text-muted">
                نقدًا متوقع: <b className="text-text">{sar(shift.expected_cash)}</b>
              </span>
            </div>
            <Button size="sm" variant="danger" icon={<Lock size={14} />} onClick={() => setCloseDlg(true)}>
              إغلاق الوردية (Z)
            </Button>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-warning">
              <Lock size={15} /> لا توجد وردية مفتوحة — افتح وردية لبدء البيع
            </span>
            <Button size="sm" icon={<Unlock size={14} />} onClick={() => setOpenDlg(true)}>
              فتح وردية
            </Button>
          </>
        )}
      </Card>

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
                      <th>خصم</th>
                      <th>الإجمالي</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((l, i) => (
                      <tr key={`${l.product_id}-${l.uom_id}-${i}`}>
                        <td className="font-semibold">
                          {l.is_weighed && <Scale size={13} className="ml-1 inline text-primary-hover" />}
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
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="ax-input w-20"
                            value={l.line_discount || ''}
                            placeholder="0"
                            onChange={(e) => update(i, { line_discount: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        </td>
                        <td className="font-bold text-gold">{sar(Math.max(0, l.qty * l.unit_price - (l.line_discount || 0)))}</td>
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
            <div className="space-y-1 border-b border-white/10 pb-3">
              <div className="flex items-center justify-between text-sm text-muted">
                <span>المجموع</span>
                <span>{sar(subtotal)}</span>
              </div>
              {lineDiscounts > 0 && (
                <div className="flex items-center justify-between text-sm text-muted">
                  <span>خصم الأسطر</span>
                  <span className="text-danger">- {sar(lineDiscounts)}</span>
                </div>
              )}
              {invDisc > 0 && (
                <div className="flex items-center justify-between text-sm text-muted">
                  <span>خصم الفاتورة</span>
                  <span className="text-danger">- {sar(invDisc)}</span>
                </div>
              )}
              {redeemVal > 0 && (
                <div className="flex items-center justify-between text-sm text-muted">
                  <span>استبدال نقاط</span>
                  <span className="text-danger">- {sar(redeemVal)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1">
                <span className="text-muted">الإجمالي</span>
                <span className="text-2xl font-bold text-gold">{sar(total)}</span>
              </div>
            </div>

            <Field label="خصم على الفاتورة">
              <div className="relative">
                <Percent size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="ax-input w-full pr-9"
                  value={invoiceDiscount}
                  onChange={(e) => setInvoiceDiscount(e.target.value)}
                  placeholder="0"
                />
              </div>
            </Field>

            {/* الولاء */}
            <div className="rounded-lg border border-white/10 p-3">
              {!customer ? (
                <div className="flex gap-2">
                  <input
                    className="ax-input flex-1"
                    placeholder="جوال العميل (ولاء)"
                    value={loyaltyPhone}
                    onChange={(e) => setLoyaltyPhone(e.target.value)}
                  />
                  <Button size="sm" variant="outline" icon={<UserPlus size={14} />} loading={loyaltyBusy} onClick={lookupLoyalty}>
                    إضافة
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-text">{customer.name}</span>
                    <button className="text-xs text-danger" onClick={() => { setCustomer(null); setRedeemPoints(''); }}>
                      إزالة
                    </button>
                  </div>
                  <div className="text-xs text-muted">
                    الرصيد: <b className="text-gold">{customer.points}</b> نقطة · قيمة النقطة {sar(customer.redeem_value)}
                  </div>
                  {customer.enabled && customer.points > 0 && (
                    <Field label="استبدال نقاط">
                      <input
                        type="number"
                        min="0"
                        max={customer.points}
                        className="ax-input w-full"
                        value={redeemPoints}
                        onChange={(e) => setRedeemPoints(e.target.value)}
                        placeholder="0"
                      />
                    </Field>
                  )}
                </div>
              )}
            </div>

            {/* طريقة الدفع */}
            <div className="grid grid-cols-3 gap-2">
              <Button variant={payMode === 'cash' ? 'primary' : 'outline'} icon={<Banknote size={16} />} onClick={() => setPayMode('cash')}>
                نقدًا
              </Button>
              <Button variant={payMode === 'card' ? 'primary' : 'outline'} icon={<CreditCard size={16} />} onClick={() => setPayMode('card')}>
                شبكة
              </Button>
              <Button variant={payMode === 'split' ? 'primary' : 'outline'} icon={<Layers size={16} />} onClick={() => setPayMode('split')}>
                مقسّم
              </Button>
            </div>

            {payMode === 'split' && (
              <Field label="مبلغ الشبكة">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="ax-input w-full"
                  value={cardAmount}
                  onChange={(e) => setCardAmount(e.target.value)}
                  placeholder="0"
                />
                <p className="mt-1 text-xs text-muted">الباقي نقدًا: {sar(cashDue)}</p>
              </Field>
            )}

            {(payMode === 'cash' || payMode === 'split') && (
              <>
                <Field label="المبلغ المدفوع (نقدًا)">
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
                disabled={cart.length === 0 || !branchId || !shift}
                onClick={() => checkout(true)}
              >
                إتمام البيع + طباعة
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  icon={<CheckCircle2 size={16} />}
                  loading={busy}
                  disabled={cart.length === 0 || !branchId || !shift}
                  onClick={() => checkout(false)}
                >
                  بلا طباعة
                </Button>
                <Button
                  variant="ghost"
                  icon={<Pause size={16} />}
                  disabled={cart.length === 0}
                  onClick={holdSale}
                >
                  تعليق
                </Button>
              </div>
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

      {/* فتح وردية */}
      <Dialog
        open={openDlg}
        onClose={() => setOpenDlg(false)}
        title="فتح وردية"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpenDlg(false)}>
              إلغاء
            </Button>
            <Button icon={<Unlock size={15} />} loading={shiftBusy} onClick={doOpenShift}>
              فتح
            </Button>
          </>
        }
      >
        <Field label="الرصيد الافتتاحي (نقدية الدرج)">
          <input
            type="number"
            step="0.01"
            min="0"
            className="ax-input w-full text-lg"
            value={openFloat}
            onChange={(e) => setOpenFloat(e.target.value)}
            placeholder="0"
            autoFocus
          />
        </Field>
      </Dialog>

      {/* إغلاق وردية (Z) */}
      <Dialog
        open={closeDlg}
        onClose={() => setCloseDlg(false)}
        title="إغلاق الوردية — تقرير Z"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCloseDlg(false)}>
              إلغاء
            </Button>
            <Button variant="danger" icon={<Lock size={15} />} loading={shiftBusy} onClick={doCloseShift}>
              إغلاق وتأكيد
            </Button>
          </>
        }
      >
        {shift && (
          <div className="space-y-2 text-sm">
            <Row label="فواتير الوردية" value={String(shift.bills)} />
            <Row label="إجمالي المبيعات" value={sar(shift.sales)} />
            <Row label="مبيعات نقدية" value={sar(shift.cash_sales)} />
            <Row label="مبيعات شبكة" value={sar(shift.card_sales)} />
            <Row label="الخصومات" value={sar(shift.discounts)} />
            <Row label="الرصيد الافتتاحي" value={sar(shift.opening_float)} />
            <Row label="النقد المتوقع بالدرج" value={sar(shift.expected_cash)} bold />
            <Field label="النقد الفعلي المُعلن">
              <input
                type="number"
                step="0.01"
                min="0"
                className="ax-input w-full text-lg"
                value={declaredCash}
                onChange={(e) => setDeclaredCash(e.target.value)}
                placeholder="0"
                autoFocus
              />
            </Field>
            {declaredCash !== '' && (
              <Row
                label="الفرق"
                value={sar((Number(declaredCash) || 0) - shift.expected_cash)}
                bold
              />
            )}
          </div>
        )}
      </Dialog>

      {/* المرتجعات */}
      <Dialog
        open={returnDlg}
        onClose={() => { setReturnDlg(false); setReturnData(null); }}
        title="مرتجع فاتورة"
        size="md"
        footer={
          returnData?.sale ? (
            <>
              <Button variant="ghost" onClick={() => { setReturnDlg(false); setReturnData(null); }}>
                إلغاء
              </Button>
              <Button variant="danger" icon={<RotateCcw size={15} />} loading={returnBusy} onClick={doReturn}>
                تنفيذ الإرجاع
              </Button>
            </>
          ) : undefined
        }
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              className="ax-input flex-1"
              placeholder={lastSaleId ? 'رقم الفاتورة (أو اترك فارغًا لآخر فاتورة)' : 'رقم الفاتورة'}
              value={returnRef}
              onChange={(e) => setReturnRef(e.target.value)}
            />
            <Button variant="outline" icon={<Search size={15} />} loading={returnBusy} onClick={lookupReturn}>
              بحث
            </Button>
          </div>

          {returnData?.sale && (
            <>
              <div className="text-xs text-muted">
                فاتورة {String(returnData.sale.id).slice(0, 8)} · {sar(returnData.sale.total_sar)}
              </div>
              <table className="ax-table">
                <thead>
                  <tr>
                    <th>الصنف</th>
                    <th>مُباع</th>
                    <th>سبق إرجاعه</th>
                    <th>كمية الإرجاع</th>
                  </tr>
                </thead>
                <tbody>
                  {returnData.items.map((it) => {
                    const max = it.qty - it.returned;
                    return (
                      <tr key={it.id}>
                        <td className="font-semibold">{it.product_name}</td>
                        <td className="text-muted">{it.qty}</td>
                        <td className="text-muted">{it.returned}</td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            max={max}
                            disabled={max <= 0}
                            className="ax-input w-24"
                            value={returnQty[it.id] || ''}
                            placeholder="0"
                            onChange={(e) =>
                              setReturnQty((q) => ({
                                ...q,
                                [it.id]: Math.min(max, Math.max(0, Number(e.target.value) || 0)),
                              }))
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="grid grid-cols-2 gap-2">
                <Button variant={returnMethod === 'cash' ? 'primary' : 'outline'} icon={<Banknote size={15} />} onClick={() => setReturnMethod('cash')}>
                  ردّ نقدًا
                </Button>
                <Button variant={returnMethod === 'card' ? 'primary' : 'outline'} icon={<CreditCard size={15} />} onClick={() => setReturnMethod('card')}>
                  ردّ شبكة
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>

      {/* الفواتير المعلّقة */}
      <Dialog open={heldDlg} onClose={() => setHeldDlg(false)} title="الفواتير المعلّقة" size="md">
        {held.length === 0 ? (
          <p className="py-6 text-center text-muted">لا توجد فواتير معلّقة</p>
        ) : (
          <div className="space-y-2">
            {held.map((h) => {
              const lines = (h.cart as CartLine[]) || [];
              const t = lines.reduce((s, l) => s + l.qty * l.unit_price - (l.line_discount || 0), 0);
              return (
                <div key={h.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2">
                  <div className="text-sm">
                    <div className="font-semibold text-text">
                      {h.label || `${lines.length} صنف`} · {sar(t)}
                    </div>
                    <div className="text-xs text-muted">{new Date(h.created_at).toLocaleString('ar')}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => resumeHeld(h)}>
                      استئناف
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 size={14} />}
                      onClick={() => {
                        adminApi.posHeldDelete(h.id).then(() => setHeld((x) => x.filter((y) => y.id !== h.id))).catch(() => {});
                      }}
                    >
                      حذف
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Dialog>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className={bold ? 'font-bold text-gold' : 'text-text'}>{value}</span>
    </div>
  );
}
