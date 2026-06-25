import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  X,
  CheckCircle2,
  MessageCircle,
  Store as StoreIcon,
  PackageX,
  Loader2,
} from 'lucide-react';
import { storeApi } from '../../lib/api';
import type {
  StoreInfo,
  StoreProduct,
  StoreCreateOrderResult,
} from '../../lib/types';

/* The storefront is fully standalone: no admin/auth contexts, no dark Black-Axis
   shell. Light, mobile-first, themed with the tenant accent color. */

const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="100%" height="100%" fill="#f1f1f4"/><text x="50%" y="50%" font-family="sans-serif" font-size="22" fill="#bcbcc4" text-anchor="middle" dominant-baseline="middle">لا توجد صورة</text></svg>`
  );

import { sar, setCurrency } from '../../lib/format';

interface CartLine {
  product: StoreProduct;
  qty: number;
}

export default function Storefront() {
  const { slug = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState<StoreInfo | null>(null);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [cartOpen, setCartOpen] = useState(false);

  // checkout
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [payment, setPayment] = useState<'cash' | 'card'>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [confirmation, setConfirmation] = useState<StoreCreateOrderResult | null>(
    null
  );

  const accent = info?.primary_color || '#C9A24B';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const i = await storeApi.info(slug);
      if (!i) {
        setInfo(null);
        setLoading(false);
        return;
      }
      setInfo(i);
      setCurrency(i.currency);
      if (!i.cod_enabled) setPayment('card');
      const p = await storeApi.listProducts(slug);
      setProducts(p || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (info?.brand_name || info?.name) {
      document.title = `${info.brand_name || info.name} — المتجر`;
    }
  }, [info]);

  const lines = useMemo(() => Object.values(cart), [cart]);
  const itemCount = useMemo(
    () => lines.reduce((s, l) => s + l.qty, 0),
    [lines]
  );
  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.product.price * l.qty, 0),
    [lines]
  );
  const deliveryFee = info?.delivery_fee || 0;
  const total = lines.length ? subtotal + deliveryFee : 0;

  function addToCart(p: StoreProduct) {
    setCart((c) => {
      const existing = c[p.id];
      const qty = Math.min((existing?.qty || 0) + 1, p.in_stock);
      return { ...c, [p.id]: { product: p, qty } };
    });
    setCartOpen(true);
  }

  function setQty(id: string, qty: number) {
    setCart((c) => {
      const line = c[id];
      if (!line) return c;
      const clamped = Math.max(1, Math.min(qty, line.product.in_stock));
      return { ...c, [id]: { ...line, qty: clamped } };
    });
  }

  function removeLine(id: string) {
    setCart((c) => {
      const next = { ...c };
      delete next[id];
      return next;
    });
  }

  async function submitOrder(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!name.trim() || !phone.trim() || !address.trim()) {
      setFormError('يرجى تعبئة جميع الحقول');
      return;
    }
    if (!lines.length) {
      setFormError('السلة فارغة');
      return;
    }
    setSubmitting(true);
    try {
      const res = await storeApi.createOrder({
        slug,
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        address: address.trim(),
        payment_method: payment,
        items: lines.map((l) => ({ product_id: l.product.id, qty: l.qty })),
      });
      setConfirmation(res);
      setCart({});
      setName('');
      setPhone('');
      setAddress('');
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function whatsappLink(): string | null {
    if (!info?.whatsapp || !confirmation) return null;
    const num = info.whatsapp.replace(/[^0-9]/g, '');
    const msg = `طلب جديد رقم ${confirmation.order_no} من متجر ${
      info.brand_name || info.name
    }. الإجمالي ${sar(confirmation.total)}`;
    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  }

  // ---- Render states ----

  if (loading) {
    return (
      <div
        dir="rtl"
        className="flex min-h-screen items-center justify-center bg-[#f6f6f8] text-gray-500"
      >
        <Loader2 className="ml-2 animate-spin" size={22} />
        جارٍ تحميل المتجر...
      </div>
    );
  }

  if (!info) {
    return (
      <div
        dir="rtl"
        className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f6f6f8] px-6 text-center"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-200 text-gray-400">
          <StoreIcon size={30} />
        </div>
        <h1 className="text-xl font-extrabold text-gray-800">المتجر غير متاح</h1>
        <p className="max-w-sm text-sm text-gray-500">
          {error || 'هذا المتجر غير موجود أو تم إيقافه حاليًا.'}
        </p>
      </div>
    );
  }

  const cssVars = { ['--accent' as string]: accent } as React.CSSProperties;

  return (
    <div dir="rtl" className="min-h-screen bg-[#f6f6f8] pb-24" style={cssVars}>
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-black/5 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl text-lg font-extrabold"
              style={{ background: `${accent}1f`, color: accent }}
            >
              {info.logo_url ? (
                <img
                  src={info.logo_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                (info.brand_name || info.name || '؟').slice(0, 1)
              )}
            </div>
            <div>
              <h1 className="text-base font-extrabold text-gray-900">
                {info.brand_name || info.name}
              </h1>
              <p className="text-[11px] text-gray-500">متجر إلكتروني</p>
            </div>
          </div>

          <button
            onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-sm transition active:scale-95"
            style={{ background: accent }}
          >
            <ShoppingCart size={18} />
            <span className="hidden sm:inline">السلة</span>
            {itemCount > 0 && (
              <span className="absolute -left-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-extrabold text-gray-900 shadow">
                {itemCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4">
        {info.description && (
          <p className="mt-5 rounded-2xl bg-white p-4 text-sm leading-relaxed text-gray-600 shadow-sm">
            {info.description}
          </p>
        )}

        {products.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-3 py-16 text-center text-gray-400">
            <PackageX size={36} />
            <p className="text-sm">لا توجد منتجات متاحة حاليًا</p>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => {
              const out = p.in_stock <= 0;
              return (
                <div
                  key={p.id}
                  className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5"
                >
                  <div className="relative aspect-square bg-gray-100">
                    <img
                      src={p.image_url || PLACEHOLDER}
                      alt={p.name}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = PLACEHOLDER;
                      }}
                    />
                    <span
                      className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        out
                          ? 'bg-rose-100 text-rose-600'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {out ? 'نفد' : 'متوفر'}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <h3 className="line-clamp-2 text-sm font-bold text-gray-900">
                      {p.name}
                    </h3>
                    {p.description && (
                      <p className="mt-1 line-clamp-2 text-[12px] text-gray-500">
                        {p.description}
                      </p>
                    )}
                    <div className="mt-auto pt-3">
                      <p
                        className="mb-2 text-base font-extrabold"
                        style={{ color: accent }}
                      >
                        {sar(p.price)}
                      </p>
                      <button
                        disabled={out}
                        onClick={() => addToCart(p)}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-bold text-white transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ background: accent }}
                      >
                        <Plus size={15} />
                        أضف للسلة
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex" dir="rtl">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setCartOpen(false)}
          />
          <div className="relative ms-auto flex h-full w-full max-w-md flex-col bg-[#f6f6f8] shadow-2xl">
            <div className="flex items-center justify-between border-b border-black/5 bg-white px-4 py-4">
              <h2 className="flex items-center gap-2 text-base font-extrabold text-gray-900">
                <ShoppingCart size={18} style={{ color: accent }} />
                سلة التسوق
              </h2>
              <button
                onClick={() => setCartOpen(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {confirmation ? (
                <div className="flex flex-col items-center gap-4 py-8 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <CheckCircle2 size={34} />
                  </div>
                  <h3 className="text-lg font-extrabold text-gray-900">
                    تم استلام طلبك!
                  </h3>
                  <p className="text-sm text-gray-600">
                    رقم الطلب:{' '}
                    <span className="font-extrabold" style={{ color: accent }}>
                      {confirmation.order_no}
                    </span>
                  </p>
                  <p className="text-sm text-gray-600">
                    الإجمالي:{' '}
                    <span className="font-extrabold">
                      {sar(confirmation.total)}
                    </span>
                  </p>
                  {whatsappLink() && (
                    <a
                      href={whatsappLink()!}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-bold text-white"
                    >
                      <MessageCircle size={18} />
                      اطلب عبر واتساب
                    </a>
                  )}
                  <button
                    onClick={() => {
                      setConfirmation(null);
                      setCartOpen(false);
                    }}
                    className="mt-1 text-sm font-semibold text-gray-500 underline"
                  >
                    متابعة التسوق
                  </button>
                </div>
              ) : lines.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center text-gray-400">
                  <ShoppingCart size={34} />
                  <p className="text-sm">سلتك فارغة</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {lines.map((l) => (
                    <div
                      key={l.product.id}
                      className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5"
                    >
                      <img
                        src={l.product.image_url || PLACEHOLDER}
                        alt=""
                        className="h-16 w-16 shrink-0 rounded-xl object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            PLACEHOLDER;
                        }}
                      />
                      <div className="flex flex-1 flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-bold text-gray-900">
                            {l.product.name}
                          </h4>
                          <button
                            onClick={() => removeLine(l.product.id)}
                            className="text-gray-400 hover:text-rose-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <p
                          className="text-sm font-extrabold"
                          style={{ color: accent }}
                        >
                          {sar(l.product.price)}
                        </p>
                        <div className="mt-auto flex items-center gap-2">
                          <button
                            onClick={() => setQty(l.product.id, l.qty - 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-700 active:scale-95"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="w-6 text-center text-sm font-bold">
                            {l.qty}
                          </span>
                          <button
                            onClick={() => setQty(l.product.id, l.qty + 1)}
                            disabled={l.qty >= l.product.in_stock}
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-700 active:scale-95 disabled:opacity-40"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* totals */}
                  <div className="space-y-1.5 rounded-2xl bg-white p-4 text-sm shadow-sm ring-1 ring-black/5">
                    <div className="flex justify-between text-gray-600">
                      <span>المجموع الفرعي</span>
                      <span className="font-bold">{sar(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>رسوم التوصيل</span>
                      <span className="font-bold">{sar(deliveryFee)}</span>
                    </div>
                    <div className="mt-1 flex justify-between border-t border-black/5 pt-2 text-base font-extrabold text-gray-900">
                      <span>الإجمالي</span>
                      <span style={{ color: accent }}>{sar(total)}</span>
                    </div>
                  </div>

                  {/* checkout form */}
                  <form
                    onSubmit={submitOrder}
                    className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5"
                  >
                    <h3 className="text-sm font-extrabold text-gray-900">
                      بيانات التوصيل
                    </h3>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="الاسم الكامل"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-gray-400"
                    />
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="رقم الجوال"
                      inputMode="tel"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-gray-400"
                    />
                    <textarea
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="عنوان التوصيل"
                      rows={2}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-gray-400"
                    />

                    <div>
                      <p className="mb-1.5 text-xs font-bold text-gray-500">
                        طريقة الدفع
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {info.cod_enabled && (
                          <button
                            type="button"
                            onClick={() => setPayment('cash')}
                            className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                              payment === 'cash'
                                ? 'text-white'
                                : 'border-gray-200 bg-gray-50 text-gray-700'
                            }`}
                            style={
                              payment === 'cash'
                                ? { background: accent, borderColor: accent }
                                : undefined
                            }
                          >
                            نقد عند الاستلام
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setPayment('card')}
                          className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                            payment === 'card'
                              ? 'text-white'
                              : 'border-gray-200 bg-gray-50 text-gray-700'
                          } ${!info.cod_enabled ? 'col-span-2' : ''}`}
                          style={
                            payment === 'card'
                              ? { background: accent, borderColor: accent }
                              : undefined
                          }
                        >
                          شبكة
                        </button>
                      </div>
                    </div>

                    {formError && (
                      <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                        {formError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-extrabold text-white transition active:scale-95 disabled:opacity-50"
                      style={{ background: accent }}
                    >
                      {submitting && (
                        <Loader2 className="animate-spin" size={16} />
                      )}
                      تأكيد الطلب · {sar(total)}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
