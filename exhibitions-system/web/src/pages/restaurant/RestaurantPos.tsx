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
} from 'lucide-react';
import { restaurantApi } from '../../lib/api';
import type {
  DiningTable,
  MenuCategory,
  MenuItem,
  NewOrderItem,
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

import { money } from '../../lib/format';
import { printReceipt } from '../../lib/print';
import { useAdminAuth } from '../../context/AdminAuthContext';
/** Restaurant POS — floor map + open table + running tab + add order + close/split/merge/transfer.
 *  token=null → owner/manager (Supabase session). token set → waiter (employee). */
export default function RestaurantPos({ token = null }: { token?: string | null }) {
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const toast = useToast();

  const loadTables = useCallback(async () => {
    try {
      setTables(await restaurantApi.tables(token));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [token, toast]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [t, m] = await Promise.all([
          restaurantApi.tables(token),
          restaurantApi.menu(token),
        ]);
        setTables(t);
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
    <Floor
      token={token}
      tables={tables}
      reload={loadTables}
      onOpenSession={(id) => setSessionId(id)}
    />
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
      toast.success(`تم الدفع: ${money(r.total)}`);
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
    printReceipt({
      brand,
      title: 'فاتورة طاولة',
      ref: `${s.session_no} — طاولة ${s.table_label}`,
      meta: [{ label: 'الضيوف', value: String(s.guest_count) }],
      lines,
      total: s.total_sar,
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
          الطاولات
        </Button>
        <h1 className="text-xl font-extrabold text-text">طاولة {s.table_label}</h1>
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
              <h3 className="text-sm font-bold text-text">فاتورة الطاولة</h3>
              <div className="flex items-center gap-3">
                <button className="text-xs font-bold text-info" onClick={printBill}>
                  طباعة
                </button>
                <button
                  className={`text-xs font-bold ${splitMode ? 'text-danger' : 'text-info'}`}
                  onClick={() => {
                    setSplitMode((v) => !v);
                    setSplitSel(new Set());
                  }}
                >
                  {splitMode ? 'إلغاء التقسيم' : 'تقسيم'}
                </button>
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
            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
              <span className="text-base font-extrabold text-text">الإجمالي</span>
              <span className="text-lg font-extrabold text-gold">{money(s.total_sar)}</span>
            </div>
          </Card>

          {/* أزرار التشغيل */}
          {splitMode ? (
            <Button className="w-full" icon={<Split size={16} />} onClick={doSplit} disabled={!splitSel.size}>
              تقسيم المحدد إلى فاتورة جديدة ({splitSel.size})
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button icon={<Receipt size={16} />} onClick={() => setPayOpen(true)}>
                إقفال ودفع
              </Button>
              <Button variant="outline" icon={<ArrowRight size={16} />} onClick={() => setMoveOpen(true)}>
                نقل طاولة
              </Button>
              <Button
                variant="outline"
                icon={<Shuffle size={16} />}
                onClick={() => setMergeOpen(true)}
                disabled={!otherOpen.length}
                className="col-span-2"
              >
                دمج مع فاتورة أخرى
              </Button>
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
      <Dialog open={payOpen} onClose={() => setPayOpen(false)} title={`إقفال الفاتورة — ${money(s.total_sar)}`}>
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
