import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Minus, Trash2, ShoppingBag, CheckCircle2, UtensilsCrossed } from 'lucide-react';
import { restaurantOnlineApi } from '../../lib/api';
import type { RestaurantPublicInfo, MenuCategory, MenuItem, NewOrderItem } from '../../lib/types';
import { Button, Dialog, Field, Input, Select, Spinner, useToast } from '../../components/ui';
import { money, setCurrency, setFx } from '../../lib/format';

interface CartLine extends NewOrderItem {
  _name: string;
  _price: number;
}

export default function RestaurantOnlineMenu() {
  const { tenantId = '' } = useParams();
  const [info, setInfo] = useState<RestaurantPublicInfo | null>(null);
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [optionItem, setOptionItem] = useState<MenuItem | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [type, setType] = useState<'takeaway' | 'delivery'>('takeaway');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [sending, setSending] = useState(false);
  const toast = useToast();

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [inf, m] = await Promise.all([restaurantOnlineApi.info(tenantId), restaurantOnlineApi.menu(tenantId)]);
        setCurrency(inf.currency);
        setFx(inf.secondary_currency, inf.fx_rate);
        setInfo(inf);
        setMenu(m);
        if (m.length) setActiveCat(m[0].id);
      } catch (e) {
        setError((e as Error).message || 'تعذّر تحميل المنيو');
      } finally {
        setLoading(false);
      }
    })();
  }, [tenantId]);

  const cartTotal = useMemo(() => cart.reduce((s, c) => s + c._price * c.qty, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((s, c) => s + c.qty, 0), [cart]);
  const deliveryFee = info?.delivery_fee || 0;
  const grand = cartTotal + (type === 'delivery' ? deliveryFee : 0);

  function addSimple(item: MenuItem) {
    if (item.options.length > 0) { setOptionItem(item); return; }
    setCart((c) => [...c, { menu_item_id: item.id, qty: 1, options: [], _name: item.name, _price: item.price }]);
  }
  function addWithOptions(item: MenuItem, opts: { name: string; price_delta: number }[], qty: number, note: string) {
    const delta = opts.reduce((s, o) => s + o.price_delta, 0);
    setCart((c) => [...c, { menu_item_id: item.id, qty, options: opts, note: note || null,
      _name: item.name + (opts.length ? ` (${opts.map((o) => o.name).join('، ')})` : ''), _price: item.price + delta }]);
    setOptionItem(null);
  }

  async function submit() {
    if (!phone.trim()) { toast.error('أدخل رقم الهاتف'); return; }
    if (type === 'delivery' && !address.trim()) { toast.error('أدخل العنوان للتوصيل'); return; }
    setSending(true);
    try {
      const r = await restaurantOnlineApi.order(
        tenantId, type, { name: name.trim(), phone: phone.trim(), address: address.trim() },
        cart.map((c) => ({ menu_item_id: c.menu_item_id, qty: c.qty, options: c.options, note: c.note })), null
      );
      setCart([]);
      setCheckout(false);
      setDone(r.order_no);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Spinner label="جارٍ التحميل..." /></div>;
  if (error) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/15 text-danger"><UtensilsCrossed size={28} /></div>
      <h1 className="text-lg font-bold text-text">{error}</h1>
    </div>
  );
  if (done) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/15 text-success"><CheckCircle2 size={40} /></div>
      <h1 className="text-xl font-extrabold text-text">تم استلام طلبك!</h1>
      <p className="text-sm text-muted">رقم الطلب: <b className="font-mono text-gold">{done}</b></p>
      <p className="text-sm text-muted">سنتواصل معك لتأكيد {type === 'delivery' ? 'التوصيل' : 'الاستلام'}. شكرًا 🌟</p>
      <Button onClick={() => setDone(null)}>طلب جديد</Button>
    </div>
  );

  const cat = menu.find((c) => c.id === activeCat);

  return (
    <div className="mx-auto min-h-screen max-w-lg pb-28">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-surface/95 px-4 py-3 backdrop-blur">
        {info?.logo_url ? <img src={info.logo_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
          : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary-hover"><UtensilsCrossed size={20} /></div>}
        <div>
          <h1 className="text-base font-extrabold text-text">{info?.brand_name}</h1>
          <p className="text-xs text-muted">اطلب أونلاين — سفري أو توصيل</p>
        </div>
      </header>

      <div className="sticky top-[64px] z-10 flex gap-2 overflow-x-auto border-b border-white/5 bg-surface/95 px-4 py-2 backdrop-blur">
        {menu.map((c) => (
          <button key={c.id} onClick={() => setActiveCat(c.id)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-bold transition ${activeCat === c.id ? 'bg-primary text-black' : 'bg-surface-2 text-muted'}`}>
            {c.name}
          </button>
        ))}
      </div>

      <div className="space-y-2 p-4">
        {(cat?.items || []).filter((i) => i.is_available).map((i) => (
          <button key={i.id} onClick={() => addSimple(i)} className="ax-card flex w-full items-center gap-3 p-3 text-right transition active:scale-[0.99]">
            {i.image_url && <img src={i.image_url} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />}
            <div className="flex-1">
              <div className="font-bold text-text">{i.name}</div>
              {i.description && <div className="text-xs text-muted line-clamp-2">{i.description}</div>}
              <div className="mt-1 text-sm font-bold text-gold">{money(i.price)}</div>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary-hover"><Plus size={18} /></span>
          </button>
        ))}
        {cat && cat.items.filter((i) => i.is_available).length === 0 && <p className="py-8 text-center text-sm text-muted">لا أصناف متاحة.</p>}
      </div>

      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-lg border-t border-white/10 bg-surface/98 p-3 backdrop-blur">
          <Button className="w-full" icon={<ShoppingBag size={16} />} onClick={() => setCheckout(true)}>
            متابعة الطلب ({cartCount}) — {money(cartTotal)}
          </Button>
        </div>
      )}

      <OptionDialog item={optionItem} onClose={() => setOptionItem(null)} onAdd={addWithOptions} />

      {/* Checkout */}
      <Dialog open={checkout} onClose={() => setCheckout(false)} title="إتمام الطلب" size="sm"
        footer={<><Button variant="ghost" onClick={() => setCheckout(false)}>رجوع</Button>
          <Button loading={sending} onClick={submit}>تأكيد الطلب — {money(grand)}</Button></>}>
        <div className="space-y-3">
          <div className="max-h-36 space-y-1.5 overflow-y-auto">
            {cart.map((c, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 text-sm">
                <button className="text-danger" onClick={() => setCart((x) => x.filter((_, i) => i !== idx))}><Trash2 size={14} /></button>
                <span className="flex-1 truncate">{c._name}</span>
                <span className="flex items-center gap-2">
                  <button onClick={() => setCart((x) => x.map((v, i) => (i === idx ? { ...v, qty: Math.max(1, v.qty - 1) } : v)))}><Minus size={13} /></button>
                  <span className="w-5 text-center font-bold">{c.qty}</span>
                  <button onClick={() => setCart((x) => x.map((v, i) => (i === idx ? { ...v, qty: v.qty + 1 } : v)))}><Plus size={13} /></button>
                  <span className="w-16 text-left text-gold">{money(c._price * c.qty)}</span>
                </span>
              </div>
            ))}
          </div>
          <Field label="نوع الطلب">
            <Select value={type} onChange={(e) => setType(e.target.value as 'takeaway' | 'delivery')}>
              <option value="takeaway">سفري (استلام)</option>
              <option value="delivery">توصيل</option>
            </Select>
          </Field>
          <Field label="الاسم"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="رقم الهاتف"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          {type === 'delivery' && <Field label="العنوان"><Input value={address} onChange={(e) => setAddress(e.target.value)} /></Field>}
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
            <div className="flex justify-between"><span className="text-muted">الأصناف</span><span>{money(cartTotal)}</span></div>
            {type === 'delivery' && deliveryFee > 0 && <div className="flex justify-between"><span className="text-muted">التوصيل</span><span>{money(deliveryFee)}</span></div>}
            <div className="mt-1 flex justify-between border-t border-white/10 pt-1 font-bold"><span>الإجمالي</span><span className="text-gold">{money(grand)}</span></div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function OptionDialog({ item, onClose, onAdd }: {
  item: MenuItem | null; onClose: () => void;
  onAdd: (item: MenuItem, opts: { name: string; price_delta: number }[], qty: number, note: string) => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  useEffect(() => { setSel(new Set()); setQty(1); setNote(''); }, [item]);
  if (!item) return null;
  const chosen = item.options.filter((o) => sel.has(o.id));
  return (
    <Dialog open={!!item} onClose={onClose} title={item.name}
      footer={<><Button variant="ghost" onClick={onClose}>إلغاء</Button>
        <Button onClick={() => onAdd(item, chosen.map((o) => ({ name: o.name, price_delta: o.price_delta })), qty, note)}>إضافة</Button></>}>
      <div className="space-y-2">
        {item.options.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={sel.has(o.id)} onChange={(e) => setSel((prev) => { const n = new Set(prev); if (e.target.checked) n.add(o.id); else n.delete(o.id); return n; })} />
              {o.name}<span className="text-[10px] text-muted">{o.group}</span>
            </span>
            {o.price_delta !== 0 && <span className="text-gold">+{money(o.price_delta)}</span>}
          </label>
        ))}
        <Field label="ملاحظة (اختياري)"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">الكمية</span>
          <Button size="sm" variant="ghost" onClick={() => setQty((q) => Math.max(1, q - 1))}><Minus size={14} /></Button>
          <span className="w-6 text-center font-bold">{qty}</span>
          <Button size="sm" variant="ghost" onClick={() => setQty((q) => q + 1)}><Plus size={14} /></Button>
        </div>
      </div>
    </Dialog>
  );
}
