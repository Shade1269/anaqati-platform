import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShoppingBasket, Plus, Minus, Trash2, Send } from 'lucide-react';
import { marketApi } from '../../lib/api';
import type { MarketBrowseItem } from '../../lib/types';
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Spinner,
  useToast,
} from '../../components/ui';

import { money } from '../../lib/format';
interface CartLine {
  listing: MarketBrowseItem;
  qty: number;
}

export default function MarketBrowse() {
  const [items, setItems] = useState<MarketBrowseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkout, setCheckout] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await marketApi.browse(null));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category).filter(Boolean))) as string[],
    [items]
  );
  const shown = cat ? items.filter((i) => i.category === cat) : items;

  function addToCart(it: MarketBrowseItem) {
    setCart((c) => {
      const ex = c.find((x) => x.listing.id === it.id);
      if (ex) return c.map((x) => (x.listing.id === it.id ? { ...x, qty: x.qty + 1 } : x));
      return [...c, { listing: it, qty: it.min_order_qty || 1 }];
    });
    toast.success('أُضيف للسلة');
  }

  const cartTotal = cart.reduce((s, l) => s + l.qty * l.listing.price, 0);

  return (
    <div>
      <PageHeader
        title="تصفّح السوق"
        subtitle="منتجات المورّدين والمشتركين الآخرين — اطلب ما تحتاجه"
        icon={<ShoppingBasket size={22} />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setCat(null)}
          className={`rounded-lg px-3 py-1.5 text-sm font-bold ${!cat ? 'bg-primary text-black' : 'bg-surface-2 text-muted'}`}
        >
          الكل
        </button>
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`rounded-lg px-3 py-1.5 text-sm font-bold ${cat === c ? 'bg-primary text-black' : 'bg-surface-2 text-muted'}`}
          >
            {c}
          </button>
        ))}
        {cart.length > 0 && (
          <Button className="ms-auto" icon={<ShoppingBasket size={16} />} onClick={() => setCheckout(true)}>
            السلة ({cart.length}) — {money(cartTotal)}
          </Button>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <EmptyState message="لا منتجات معروضة في السوق حاليًا." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((it) => (
            <Card key={it.id}>
              <div className="flex h-full flex-col">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h3 className="font-bold text-text">{it.name}</h3>
                  {it.category && (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted">{it.category}</span>
                  )}
                </div>
                <p className="text-xs text-muted">المورّد: {it.seller_name}</p>
                {it.description && <p className="mt-1 text-xs text-muted">{it.description}</p>}
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-bold text-gold">
                    {money(it.price)} <span className="text-[11px] text-muted">/ {it.unit}</span>
                  </span>
                  <span className="text-[10px] text-muted">أقل كمية {it.min_order_qty}</span>
                </div>
                <Button size="sm" className="mt-3 w-full" icon={<Plus size={14} />} onClick={() => addToCart(it)}>
                  أضف للسلة
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {checkout && (
        <CheckoutDialog
          cart={cart}
          setCart={setCart}
          onClose={() => setCheckout(false)}
          onDone={() => {
            setCart([]);
            setCheckout(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function CheckoutDialog({
  cart,
  setCart,
  onClose,
  onDone,
}: {
  cart: CartLine[];
  setCart: React.Dispatch<React.SetStateAction<CartLine[]>>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pm, setPm] = useState<'cash' | 'credit'>('cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  // مجموعة حسب المورّد (طلب لكل مورّد)
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; lines: CartLine[] }>();
    cart.forEach((l) => {
      const k = l.listing.seller_tenant_id;
      if (!m.has(k)) m.set(k, { name: l.listing.seller_name, lines: [] });
      m.get(k)!.lines.push(l);
    });
    return Array.from(m.entries());
  }, [cart]);

  async function submit() {
    setBusy(true);
    try {
      for (const [seller, g] of groups) {
        await marketApi.placeOrder(
          seller,
          g.lines.map((l) => ({ listing_id: l.listing.id, qty: l.qty })),
          pm,
          note.trim() || null
        );
      }
      toast.success(`تم إرسال ${groups.length} طلب`);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="إتمام الطلب"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            رجوع
          </Button>
          <Button onClick={submit} loading={busy} icon={<Send size={14} />} disabled={!cart.length}>
            إرسال الطلب
          </Button>
        </>
      }
    >
      {cart.length === 0 ? (
        <p className="text-sm text-muted">السلة فارغة.</p>
      ) : (
        <div className="space-y-4">
          {groups.map(([seller, g]) => (
            <div key={seller} className="rounded-lg border border-white/8 p-3">
              <p className="mb-2 text-sm font-bold text-text">المورّد: {g.name}</p>
              <div className="space-y-1.5">
                {g.lines.map((l) => (
                  <div key={l.listing.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <button className="text-danger" onClick={() => setCart((c) => c.filter((x) => x.listing.id !== l.listing.id))}>
                        <Trash2 size={14} />
                      </button>
                      {l.listing.name}
                    </span>
                    <span className="flex items-center gap-2">
                      <button onClick={() => setCart((c) => c.map((x) => (x.listing.id === l.listing.id ? { ...x, qty: Math.max(l.listing.min_order_qty || 1, x.qty - 1) } : x)))}>
                        <Minus size={13} />
                      </button>
                      <span className="w-8 text-center font-bold">{l.qty}</span>
                      <button onClick={() => setCart((c) => c.map((x) => (x.listing.id === l.listing.id ? { ...x, qty: x.qty + 1 } : x)))}>
                        <Plus size={13} />
                      </button>
                      <span className="w-20 text-left text-gold">{money(l.qty * l.listing.price)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <Field label="طريقة الدفع">
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={pm === 'cash' ? 'primary' : 'outline'} onClick={() => setPm('cash')}>
                نقدًا
              </Button>
              <Button type="button" size="sm" variant={pm === 'credit' ? 'primary' : 'outline'} onClick={() => setPm('credit')}>
                آجل (ذمم)
              </Button>
            </div>
          </Field>
          <Field label="ملاحظة (اختياري)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {groups.length > 1 && (
            <p className="text-xs text-muted">سيُرسَل طلب منفصل لكل مورّد ({groups.length} طلبات).</p>
          )}
        </div>
      )}
    </Dialog>
  );
}
