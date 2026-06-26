import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Armchair,
  Plus,
  Minus,
  ArrowRight,
  Receipt,
  Split,
  Shuffle,
  Send,
  Users,
  Trash2,
  ShoppingBag,
  Truck,
} from 'lucide-react';
import { restaurantApi } from '../../lib/api';
import type {
  DiningTable,
  MenuCategory,
  MenuItem,
  NewOrderItem,
  QuickSession,
  SessionDetail,
} from '../../lib/types';
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

import { money, money2 } from '../../lib/format';
import { printReceipt } from '../../lib/print';
import { useAdminAuth } from '../../context/AdminAuthContext';
/** Restaurant POS — floor map + open table + running tab + add order + close/split/merge/transfer.
 *  token=null → owner/manager (Supabase session). token set → waiter (employee). */
export default function RestaurantPos({ token = null }: { token?: string | null }) {
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [quick, setQuick] = useState<QuickSession[]>([]);
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const toast = useToast();

  const loadTables = useCallback(async () => {
    try {
      const [t, q] = await Promise.all([
        restaurantApi.tables(token),
        restaurantApi.quickSessions(token),
      ]);
      setTables(t);
      setQuick(q);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [token, toast]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [t, q, m] = await Promise.all([
          restaurantApi.tables(token),
          restaurantApi.quickSessions(token),
          restaurantApi.menu(token),
        ]);
        setTables(t);
        setQuick(q);
        setMenu(m);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading) return <Spinner label="جارٍ التحميل..." />;

  if (sessionId) {
    return (
      <SessionView
        token={token}
        sessionId={sessionId}
        menu={menu}
        tables={tables}
        onBack={() => {
          setSessionId(null);
          loadTables();
        }}
        onPickSession={(id) => setSessionId(id)}
      />
    );
  }

  return (
    <div className="space-y-8">
      <QuickOrders
        token={token}
        quick={quick}
        reload={loadTables}
        onOpenSession={(id) => setSessionId(id)}
      />
      <Floor
        token={token}
        tables={tables}
        reload={loadTables}
        onOpenSession={(id) => setSessionId(id)}
      />
    </div>
  );
}

/* ----------------------------- Takeaway / Delivery ----------------------------- */

const ORDER_TYPE_LABEL: Record<string, string> = {
  dine_in: 'صالة',
  takeaway: 'سفري',
  delivery: 'توصيل',
};

function QuickOrders({
  token,
  quick,
  reload,
  onOpenSession,
}: {
  token: string | null;
  quick: QuickSession[];
  reload: () => void;
  onOpenSession: (sessionId: string) => void;
}) {
  const [newType, setNewType] = useState<'takeaway' | 'delivery' | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [fee, setFee] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  function reset() {
    setNewType(null);
    setName('');
    setPhone('');
    setAddress('');
    setFee('');
  }

  async function create() {
    if (!newType) return;
    setBusy(true);
    try {
      const r = await restaurantApi.openQuick(
        newType,
        {
          name: name.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          deliveryFee: newType === 'delivery' ? Number(fee) || 0 : 0,
        },
        token
      );
      reset();
      onOpenSession(r.session_id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-muted">طلبات سفري / توصيل</h2>
        <div className="flex gap-2">
          <Button size="sm" icon={<ShoppingBag size={15} />} onClick={() => setNewType('takeaway')}>
            طلب سفري
          </Button>
          <Button size="sm" variant="outline" icon={<Truck size={15} />} onClick={() => setNewType('delivery')}>
            طلب توصيل
          </Button>
        </div>
      </div>

      {quick.length === 0 ? (
        <p className="text-sm text-muted">لا طلبات سفري/توصيل مفتوحة.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {quick.map((q) => (
            <button
              key={q.id}
              onClick={() => onOpenSession(q.id)}
              className="ax-card flex flex-col items-start gap-1 border-info/40 bg-info/5 p-4 text-right transition hover:-translate-y-0.5"
            >
              <div className="flex w-full items-center justify-between">
                <span className="flex items-center gap-1 text-sm font-extrabold text-text">
                  {q.order_type === 'delivery' ? <Truck size={14} /> : <ShoppingBag size={14} />}
                  {ORDER_TYPE_LABEL[q.order_type]}
                </span>
                <span className="font-mono text-[10px] text-muted">{q.session_no}</span>
              </div>
              {q.customer_name && <span className="text-xs text-muted">{q.customer_name}</span>}
              {q.customer_phone && <span className="text-[11px] text-muted" dir="ltr">{q.customer_phone}</span>}
              <span className="mt-1 text-sm font-bold text-gold">{money(q.total)}</span>
            </button>
          ))}
        </div>
      )}

      <Dialog
        open={!!newType}
        onClose={reset}
        title={newType === 'delivery' ? 'طلب توصيل جديد' : 'طلب سفري جديد'}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={reset}>
              إلغاء
            </Button>
            <Button onClick={create} loading={busy}>
              بدء الطلب
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="اسم الزبون (اختياري)">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="الهاتف (اختياري)">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          {newType === 'delivery' && (
            <>
              <Field label="العنوان">
                <Input value={address} onChange={(e) => setAddress(e.target.value)} />
              </Field>
              <Field label="رسوم التوصيل">
                <Input type="number" step="0.01" min="0" value={fee} onChange={(e) => setFee(e.target.value)} />
              </Field>
            </>
          )}
        </div>
        <div className="mt-2">
          <Button variant="ghost" size="sm" onClick={reload}>
            تحديث
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

/* ----------------------------- Floor map ----------------------------- */

function Floor({
  token,
  tables,
  reload,
  onOpenSession,
}: {
  token: string | null;
  tables: DiningTable[];
  reload: () => void;
  onOpenSession: (sessionId: string) => void;
}) {
  const [openFor, setOpenFor] = useState<DiningTable | null>(null);
  const [guests, setGuests] = useState('2');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const sections = useMemo(() => {
    const m = new Map<string, DiningTable[]>();
    tables.forEach((t) => {
      const k = t.section || 'الصالة';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    });
    return Array.from(m.entries());
  }, [tables]);

  async function doOpen() {
    if (!openFor) return;
    setBusy(true);
    try {
      const r = await restaurantApi.openTable(openFor.id, Number(guests) || 1, token);
      setOpenFor(null);
      setGuests('2');
      onOpenSession(r.session_id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function clickTable(t: DiningTable) {
    if (t.sessions.length === 1) return onOpenSession(t.sessions[0].id);
    if (t.sessions.length === 0) {
      setOpenFor(t);
      return;
    }
    // multiple bills → pick handled in dialog below
    setOpenFor(t);
  }

  return (
    <div>
      <PageHeader
        title="الطاولات"
        subtitle="اضغط طاولة فاضية لفتحها، أو طاولة مشغولة لإكمال طلبها"
        icon={<Armchair size={22} />}
      />

      {tables.length === 0 ? (
        <EmptyState message="لا توجد طاولات بعد. أضِف طاولات من صفحة إدارة الطاولات." />
      ) : (
        sections.map(([name, ts]) => (
          <div key={name} className="mb-7">
            <h2 className="mb-3 text-sm font-bold text-muted">{name}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {ts.map((t) => {
                const busyTable = t.sessions.length > 0;
                const total = t.sessions.reduce((s, x) => s + (x.total || 0), 0);
                return (
                  <button
                    key={t.id}
                    onClick={() => clickTable(t)}
                    className={`ax-card flex flex-col items-start gap-1 p-4 text-right transition hover:-translate-y-0.5 ${
                      busyTable ? 'border-primary/50 bg-primary/8' : 'hover:border-primary/30'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="text-lg font-extrabold text-text">{t.label}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          busyTable ? 'bg-primary/20 text-primary-hover' : 'bg-success/15 text-success'
                        }`}
                      >
                        {busyTable ? 'مشغولة' : 'فاضية'}
                      </span>
                    </div>
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <Users size={12} /> {t.seats} مقاعد
                    </span>
                    {busyTable && (
                      <span className="mt-1 text-sm font-bold text-gold">{money(total)}</span>
                    )}
                    {t.sessions.length > 1 && (
                      <span className="text-[10px] text-warning">{t.sessions.length} فواتير</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}

      <Dialog
        open={!!openFor}
        onClose={() => setOpenFor(null)}
        title={`طاولة ${openFor?.label ?? ''}`}
        footer={
          openFor && openFor.sessions.length === 0 ? (
            <>
              <Button variant="ghost" onClick={() => setOpenFor(null)}>
                إلغاء
              </Button>
              <Button onClick={doOpen} loading={busy}>
                فتح الطاولة
              </Button>
            </>
          ) : undefined
        }
      >
        {openFor && openFor.sessions.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted">اختر الفاتورة:</p>
            {openFor.sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setOpenFor(null);
                  onOpenSession(s.id);
                }}
                className="ax-card flex w-full items-center justify-between p-3 text-right hover:border-primary/40"
              >
                <span className="font-mono text-xs text-muted">{s.session_no}</span>
                <span className="font-bold text-gold">{money(s.total)}</span>
              </button>
            ))}
          </div>
        ) : (
          <Field label="عدد الضيوف">
            <Input
              type="number"
              min={1}
              value={guests}
              onChange={(e) => setGuests(e.target.value)}
            />
          </Field>
        )}
      </Dialog>
      <div className="mt-2">
        <Button variant="ghost" size="sm" onClick={reload}>
          تحديث
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------- Session view ----------------------------- */

interface CartLine extends NewOrderItem {
  _name: string;
  _price: number;
}

function SessionView({
  token,
  sessionId,
  menu,
  tables,
  onBack,
  onPickSession,
}: {
  token: string | null;
  sessionId: string;
  menu: MenuCategory[];
  tables: DiningTable[];
  onBack: () => void;
  onPickSession: (id: string) => void;
}) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [optionItem, setOptionItem] = useState<MenuItem | null>(null);
  const [closing, setClosing] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const [splitSel, setSplitSel] = useState<Set<string>>(new Set());
  const toast = useToast();
  const { profile } = useAdminAuth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await restaurantApi.sessionDetail(sessionId, token));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [sessionId, token, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!activeCat && menu.length) setActiveCat(menu[0].id);
  }, [menu, activeCat]);

  const cartTotal = cart.reduce((s, c) => s + c._price * c.qty, 0);

  function addSimple(item: MenuItem) {
    if (item.options.length > 0) {
      setOptionItem(item);
      return;
    }
    setCart((c) => [
      ...c,
      { menu_item_id: item.id, qty: 1, options: [], _name: item.name, _price: item.price },
    ]);
  }

  function addWithOptions(item: MenuItem, opts: { name: string; price_delta: number }[], qty: number, note: string) {
    const delta = opts.reduce((s, o) => s + o.price_delta, 0);
    setCart((c) => [
      ...c,
      {
        menu_item_id: item.id,
        qty,
        options: opts,
        note: note || null,
        _name: item.name + (opts.length ? ` (${opts.map((o) => o.name).join('، ')})` : ''),
        _price: item.price + delta,
      },
    ]);
    setOptionItem(null);
  }

  async function sendOrder() {
    if (!cart.length) return;
    try {
      await restaurantApi.addOrder(
        sessionId,
        cart.map((c) => ({ menu_item_id: c.menu_item_id, qty: c.qty, options: c.options, note: c.note })),
        null,
        token
      );
      setCart([]);
      toast.success('أُرسل الطلب للمطبخ');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function closeBill(pm: 'cash' | 'card') {
    setClosing(true);
    try {
      const r = await restaurantApi.closeBill(sessionId, pm, token);
      toast.success(`تم الدفع: ${money(r.charged ?? r.total)}`);
      onBack();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setClosing(false);
      setPayOpen(false);
    }
  }

  async function doSplit() {
    if (!splitSel.size) return;
    try {
      await restaurantApi.splitSession(sessionId, Array.from(splitSel), token);
      toast.success('تم تقسيم الفاتورة');
      setSplitMode(false);
      setSplitSel(new Set());
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function doTransfer(toTableId: string) {
    try {
      await restaurantApi.transferTable(sessionId, toTableId, token);
      toast.success('تم نقل الطاولة');
      setMoveOpen(false);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function doMerge(intoSessionId: string) {
    try {
      await restaurantApi.mergeTables(sessionId, intoSessionId, token);
      toast.success('تم دمج الفاتورة');
      setMergeOpen(false);
      onPickSession(intoSessionId);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (loading || !detail) return <Spinner label="جارٍ التحميل..." />;
  const s = detail.session;
  if (!s) return <EmptyState message="الجلسة غير موجودة" />;

  const isQuick = !s.table_label;
  const deliveryFee = s.delivery_fee || 0;
  const charged = s.total_sar + deliveryFee;
  const heading = isQuick
    ? `${ORDER_TYPE_LABEL[s.order_type]}${s.customer_name ? ` — ${s.customer_name}` : ''}`
    : `طاولة ${s.table_label}`;

  function printBill() {
    if (!s || !detail) return;
    const brand = profile?.tenant?.brand_name || profile?.tenant?.name || 'فاتورة';
    const lines = detail.orders.flatMap((o) =>
      o.items.map((it) => ({
        name: it.name + (it.options?.length ? ` (${it.options.map((x) => x.name).join('، ')})` : ''),
        qty: it.qty,
        amount: it.line_total,
        note: it.note,
      }))
    );
    if (deliveryFee > 0) lines.push({ name: 'رسوم التوصيل', qty: 1, amount: deliveryFee, note: null });
    const meta = isQuick
      ? [
          { label: 'النوع', value: ORDER_TYPE_LABEL[s.order_type] },
          ...(s.customer_name ? [{ label: 'الزبون', value: s.customer_name }] : []),
          ...(s.customer_phone ? [{ label: 'الهاتف', value: s.customer_phone }] : []),
          ...(s.address ? [{ label: 'العنوان', value: s.address }] : []),
        ]
      : [{ label: 'الضيوف', value: String(s.guest_count) }];
    printReceipt({
      brand,
      title: isQuick ? `فاتورة ${ORDER_TYPE_LABEL[s.order_type]}` : 'فاتورة طاولة',
      ref: isQuick ? s.session_no : `${s.session_no} — طاولة ${s.table_label}`,
      meta,
      lines,
      total: charged,
    });
  }

  const cat = menu.find((c) => c.id === activeCat);
  const freeTables = tables.filter((t) => t.sessions.length === 0 && t.is_active);
  const otherOpen = tables
    .flatMap((t) => t.sessions.map((ss) => ({ ...ss, table_label: t.label })))
    .filter((ss) => ss.id !== sessionId);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" icon={<ArrowRight size={16} />} onClick={onBack}>
          رجوع
        </Button>
        <h1 className="text-xl font-extrabold text-text">{heading}</h1>
        <span className="font-mono text-xs text-muted">{s.session_no}</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        {/* المنيو */}
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            {menu.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCat(c.id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${
                  activeCat === c.id ? 'bg-primary text-black' : 'bg-surface-2 text-muted hover:text-text'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(cat?.items || []).filter((i) => i.is_available).map((i) => (
              <button
                key={i.id}
                onClick={() => addSimple(i)}
                className="ax-card flex flex-col items-start p-3 text-right transition hover:border-primary/40"
              >
                <span className="font-bold text-text">{i.name}</span>
                <span className="mt-1 text-sm text-gold">{money(i.price)}</span>
                {i.options.length > 0 && (
                  <span className="text-[10px] text-muted">+ خيارات</span>
                )}
              </button>
            ))}
            {cat && cat.items.filter((i) => i.is_available).length === 0 && (
              <p className="col-span-full text-sm text-muted">لا أصناف في هذا القسم.</p>
            )}
          </div>
        </div>

        {/* الفاتورة + السلة */}
        <div className="space-y-4">
          {/* سلة جديدة */}
          {cart.length > 0 && (
            <Card>
              <h3 className="mb-2 text-sm font-bold text-text">طلب جديد (لم يُرسل)</h3>
              <div className="space-y-1.5">
                {cart.map((c, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <button
                        className="text-danger"
                        onClick={() => setCart((x) => x.filter((_, i) => i !== idx))}
                      >
                        <Trash2 size={14} />
                      </button>
                      {c._name}
                    </span>
                    <span className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setCart((x) => x.map((v, i) => (i === idx ? { ...v, qty: Math.max(1, v.qty - 1) } : v)))
                        }
                      >
                        <Minus size={13} />
                      </button>
                      <span className="w-5 text-center font-bold">{c.qty}</span>
                      <button
                        onClick={() => setCart((x) => x.map((v, i) => (i === idx ? { ...v, qty: v.qty + 1 } : v)))}
                      >
                        <Plus size={13} />
                      </button>
                      <span className="w-16 text-left text-gold">{money(c._price * c.qty)}</span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-bold text-text">{money(cartTotal)}</span>
                <Button size="sm" icon={<Send size={14} />} onClick={sendOrder}>
                  إرسال للمطبخ
                </Button>
              </div>
            </Card>
          )}

          {/* الطلبات المرسلة */}
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-text">الفاتورة</h3>
              <div className="flex items-center gap-3">
                <button className="text-xs font-bold text-info" onClick={printBill}>
                  طباعة
                </button>
                {!isQuick && (
                  <button
                    className={`text-xs font-bold ${splitMode ? 'text-danger' : 'text-info'}`}
                    onClick={() => {
                      setSplitMode((v) => !v);
                      setSplitSel(new Set());
                    }}
                  >
                    {splitMode ? 'إلغاء التقسيم' : 'تقسيم'}
                  </button>
                )}
              </div>
            </div>
            {detail.orders.length === 0 ? (
              <p className="text-sm text-muted">لا طلبات بعد.</p>
            ) : (
              <div className="space-y-2">
                {detail.orders.map((o) => (
                  <div key={o.id} className="rounded-lg border border-white/8 p-2">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                      <span className="font-mono">{o.order_no}</span>
                      <span>{statusLabel(o.status)}</span>
                    </div>
                    {o.items.map((it) => (
                      <label
                        key={it.id}
                        className={`flex items-center justify-between gap-2 py-0.5 text-sm ${
                          splitMode ? 'cursor-pointer' : ''
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          {splitMode && (
                            <input
                              type="checkbox"
                              checked={splitSel.has(it.id)}
                              onChange={(e) => {
                                setSplitSel((prev) => {
                                  const n = new Set(prev);
                                  if (e.target.checked) n.add(it.id);
                                  else n.delete(it.id);
                                  return n;
                                });
                              }}
                            />
                          )}
                          {it.qty}× {it.name}
                          {it.options?.length > 0 && (
                            <span className="text-[10px] text-muted">
                              ({it.options.map((x) => x.name).join('، ')})
                            </span>
                          )}
                        </span>
                        <span className="text-gold">{money(it.line_total)}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {deliveryFee > 0 && (
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-muted">الأصناف</span>
                <span className="text-muted">{money(s.total_sar)}</span>
              </div>
            )}
            {deliveryFee > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">رسوم التوصيل</span>
                <span className="text-muted">{money(deliveryFee)}</span>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
              <span className="text-base font-extrabold text-text">الإجمالي</span>
              <span className="text-left">
                <span className="text-lg font-extrabold text-gold">{money(charged)}</span>
                {money2(charged) && <span className="block text-[11px] text-muted">≈ {money2(charged)}</span>}
              </span>
            </div>
          </Card>

          {/* أزرار التشغيل */}
          {splitMode ? (
            <Button className="w-full" icon={<Split size={16} />} onClick={doSplit} disabled={!splitSel.size}>
              تقسيم المحدد إلى فاتورة جديدة ({splitSel.size})
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button
                icon={<Receipt size={16} />}
                onClick={() => setPayOpen(true)}
                className={isQuick ? 'col-span-2' : ''}
              >
                إقفال ودفع
              </Button>
              {!isQuick && (
                <>
                  <Button variant="outline" icon={<ArrowRight size={16} />} onClick={() => setMoveOpen(true)}>
                    نقل طاولة
                  </Button>
                  <Button
                    variant="outline"
                    icon={<Shuffle size={16} />}
                    onClick={() => setMergeOpen(true)}
                    disabled={!otherOpen.length}
                  >
                    دمج مع فاتورة أخرى
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* خيارات الصنف */}
      <OptionDialog
        item={optionItem}
        onClose={() => setOptionItem(null)}
        onAdd={addWithOptions}
      />

      {/* الدفع */}
      <Dialog open={payOpen} onClose={() => setPayOpen(false)} title={`إقفال الفاتورة — ${money(charged)}`}>
        <p className="mb-4 text-sm text-muted">اختر طريقة الدفع:</p>
        <div className="grid grid-cols-2 gap-3">
          <Button loading={closing} onClick={() => closeBill('cash')}>
            نقدًا
          </Button>
          <Button variant="outline" loading={closing} onClick={() => closeBill('card')}>
            شبكة
          </Button>
        </div>
      </Dialog>

      {/* نقل */}
      <Dialog open={moveOpen} onClose={() => setMoveOpen(false)} title="نقل إلى طاولة فاضية">
        {freeTables.length === 0 ? (
          <p className="text-sm text-muted">لا طاولات فاضية.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {freeTables.map((t) => (
              <Button key={t.id} variant="outline" onClick={() => doTransfer(t.id)}>
                {t.label}
              </Button>
            ))}
          </div>
        )}
      </Dialog>

      {/* دمج */}
      <Dialog open={mergeOpen} onClose={() => setMergeOpen(false)} title="دمج هذه الفاتورة في">
        {otherOpen.length === 0 ? (
          <p className="text-sm text-muted">لا فواتير مفتوحة أخرى.</p>
        ) : (
          <div className="space-y-2">
            {otherOpen.map((ss) => (
              <button
                key={ss.id}
                onClick={() => doMerge(ss.id)}
                className="ax-card flex w-full items-center justify-between p-3 text-right hover:border-primary/40"
              >
                <span>طاولة {ss.table_label}</span>
                <span className="font-bold text-gold">{money(ss.total)}</span>
              </button>
            ))}
          </div>
        )}
      </Dialog>
    </div>
  );
}

function statusLabel(s: string) {
  return (
    { new: 'جديد', preparing: 'تحضير', ready: 'جاهز', served: 'قُدّم', cancelled: 'ملغى' }[s] || s
  );
}

/* ----------------------------- Option picker ----------------------------- */

function OptionDialog({
  item,
  onClose,
  onAdd,
}: {
  item: MenuItem | null;
  onClose: () => void;
  onAdd: (item: MenuItem, opts: { name: string; price_delta: number }[], qty: number, note: string) => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');

  useEffect(() => {
    setSel(new Set());
    setQty(1);
    setNote('');
  }, [item]);

  if (!item) return null;
  const chosen = item.options.filter((o) => sel.has(o.id));

  return (
    <Dialog
      open={!!item}
      onClose={onClose}
      title={item.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => onAdd(item, chosen.map((o) => ({ name: o.name, price_delta: o.price_delta })), qty, note)}>
            إضافة
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {item.options.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={sel.has(o.id)}
                onChange={(e) =>
                  setSel((prev) => {
                    const n = new Set(prev);
                    if (e.target.checked) n.add(o.id);
                    else n.delete(o.id);
                    return n;
                  })
                }
              />
              {o.name}
              <span className="text-[10px] text-muted">{o.group}</span>
            </span>
            {o.price_delta !== 0 && <span className="text-gold">+{money(o.price_delta)}</span>}
          </label>
        ))}
        <Field label="ملاحظة (اختياري)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="بدون بصل..." />
        </Field>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">الكمية</span>
          <Button size="sm" variant="ghost" onClick={() => setQty((q) => Math.max(1, q - 1))}>
            <Minus size={14} />
          </Button>
          <span className="w-6 text-center font-bold">{qty}</span>
          <Button size="sm" variant="ghost" onClick={() => setQty((q) => q + 1)}>
            <Plus size={14} />
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
