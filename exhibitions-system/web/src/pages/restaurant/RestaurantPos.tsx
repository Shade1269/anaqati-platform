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
  Ban,
  ShoppingBag,
  Truck,
  Wallet,
  FileText,
  Settings,
} from 'lucide-react';
import { restaurantApi } from '../../lib/api';
import type {
  DiningTable,
  MenuCategory,
  MenuItem,
  NewOrderItem,
  QuickSession,
  ShiftZ,
  RestaurantSettings,
  LoyaltyCustomer,
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
  Select,
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
      <ShiftBar token={token} />
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

/* ----------------------------- Cashier shift + Z report ----------------------------- */

function fmtTime(s: string): string {
  try {
    return new Date(s).toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return s;
  }
}

function ShiftBar({ token }: { token: string | null }) {
  const [shift, setShift] = useState<ShiftZ | null>(null);
  const [loading, setLoading] = useState(true);
  const [openDlg, setOpenDlg] = useState(false);
  const [closeDlg, setCloseDlg] = useState(false);
  const [zView, setZView] = useState<ShiftZ | null>(null);
  const [float, setFloat] = useState('');
  const [declared, setDeclared] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [setOpen, setSetOpen] = useState(false);
  const [svcPct, setSvcPct] = useState('');
  const [taxPct, setTaxPct] = useState('');
  const [loyEnabled, setLoyEnabled] = useState(false);
  const [loyEarn, setLoyEarn] = useState('');
  const [loyRedeem, setLoyRedeem] = useState('');
  const toast = useToast();
  const { profile } = useAdminAuth();
  const brand = profile?.tenant?.brand_name || profile?.tenant?.name || 'المطعم';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setShift(await restaurantApi.shiftCurrent(token));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function doOpen() {
    setBusy(true);
    try {
      const z = await restaurantApi.shiftOpen(Number(float) || 0, token);
      setShift(z);
      setOpenDlg(false);
      setFloat('');
      toast.success('فُتحت الوردية');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshZ() {
    if (!shift) return;
    try {
      setZView(await restaurantApi.shiftZ(shift.id, token));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function doClose() {
    setBusy(true);
    try {
      const z = await restaurantApi.shiftClose(Number(declared) || 0, note.trim() || null, token);
      setCloseDlg(false);
      setDeclared('');
      setNote('');
      setShift(null);
      setZView(z);
      toast.success('أُغلقت الوردية');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openSettings() {
    try {
      const st = await restaurantApi.settings(token);
      setSvcPct(String(st.service_pct ?? 0));
      setTaxPct(String(st.tax_pct ?? 0));
      setLoyEnabled(!!st.loyalty_enabled);
      setLoyEarn(String(st.loyalty_earn_rate ?? 0));
      setLoyRedeem(String(st.loyalty_redeem_value ?? 0));
      setSetOpen(true);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function saveSettings() {
    setBusy(true);
    try {
      await restaurantApi.setSettings(Number(svcPct) || 0, Number(taxPct) || 0);
      await restaurantApi.setLoyalty(loyEnabled, Number(loyEarn) || 0, Number(loyRedeem) || 0);
      setSetOpen(false);
      toast.success('حُفظت الإعدادات');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function printZ(z: ShiftZ) {
    printReceipt({
      brand,
      title: 'تقرير وردية (Z)',
      ref: `${z.status === 'closed' ? 'مغلقة' : 'مفتوحة'} — ${fmtTime(z.opened_at)}`,
      meta: [
        { label: 'الرصيد الافتتاحي', value: money(z.opening_float) },
        { label: 'عدد الفواتير', value: String(z.bills) },
      ],
      lines: [
        { name: 'مبيعات صالة', qty: 1, amount: z.dine_in, note: null },
        { name: 'مبيعات سفري', qty: 1, amount: z.takeaway, note: null },
        { name: 'مبيعات توصيل', qty: 1, amount: z.delivery, note: null },
        { name: 'نقدًا', qty: 1, amount: z.cash_sales, note: null },
        { name: 'شبكة', qty: 1, amount: z.card_sales, note: null },
        { name: 'النقد المتوقّع بالدرج', qty: 1, amount: z.expected_cash, note: null },
        ...(z.declared_cash != null
          ? [
              { name: 'النقد المعلن (الجرد)', qty: 1, amount: z.declared_cash, note: null },
              {
                name: (z.variance ?? 0) < 0 ? 'عجز' : 'زيادة',
                qty: 1,
                amount: Math.abs(z.variance ?? 0),
                note: null,
              },
            ]
          : []),
      ],
      total: z.sales,
    });
  }

  if (loading) return null;

  return (
    <div>
      {shift ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/8 px-4 py-2.5 text-sm">
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5 font-bold text-success">
              <Wallet size={15} /> وردية مفتوحة
            </span>
            <span className="text-muted">منذ {fmtTime(shift.opened_at)}</span>
            <span className="text-muted">الفواتير: <b className="text-text">{shift.bills}</b></span>
            <span className="text-muted">المبيعات: <b className="text-gold">{money(shift.sales)}</b></span>
            <span className="text-muted">نقد: <b className="text-text">{money(shift.cash_sales)}</b></span>
          </span>
          <span className="flex gap-2">
            {!token && (
              <Button size="sm" variant="ghost" icon={<Settings size={15} />} onClick={openSettings}>
                النِسَب
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={<FileText size={15} />} onClick={refreshZ}>
              تقرير Z
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCloseDlg(true)}>
              إغلاق الوردية
            </Button>
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm">
          <span className="flex items-center gap-1.5 text-muted">
            <Wallet size={15} /> لا توجد وردية مفتوحة
          </span>
          <span className="flex gap-2">
            {!token && (
              <Button size="sm" variant="ghost" icon={<Settings size={15} />} onClick={openSettings}>
                النِسَب
              </Button>
            )}
            <Button size="sm" icon={<Wallet size={15} />} onClick={() => setOpenDlg(true)}>
              فتح وردية
            </Button>
          </span>
        </div>
      )}

      <Dialog
        open={openDlg}
        onClose={() => setOpenDlg(false)}
        title="فتح وردية"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpenDlg(false)}>إلغاء</Button>
            <Button onClick={doOpen} loading={busy}>فتح</Button>
          </>
        }
      >
        <Field label="الرصيد النقدي الافتتاحي بالدرج">
          <Input type="number" step="0.01" min="0" value={float} onChange={(e) => setFloat(e.target.value)} autoFocus />
        </Field>
      </Dialog>

      <Dialog
        open={closeDlg}
        onClose={() => setCloseDlg(false)}
        title="إغلاق الوردية"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCloseDlg(false)}>إلغاء</Button>
            <Button onClick={doClose} loading={busy}>إغلاق وعرض Z</Button>
          </>
        }
      >
        {shift && (
          <div className="space-y-3">
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
              <span className="text-muted">النقد المتوقّع بالدرج: </span>
              <b className="text-gold">{money(shift.expected_cash)}</b>
              <span className="block text-[11px] text-muted">
                (افتتاحي {money(shift.opening_float)} + مبيعات نقد {money(shift.cash_sales)})
              </span>
            </div>
            <Field label="النقد الفعلي المعدود (الجرد)">
              <Input type="number" step="0.01" min="0" value={declared} onChange={(e) => setDeclared(e.target.value)} autoFocus />
            </Field>
            <Field label="ملاحظة (اختياري)">
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!zView}
        onClose={() => setZView(null)}
        title="تقرير الوردية (Z)"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setZView(null)}>إغلاق</Button>
            {zView && <Button onClick={() => printZ(zView)}>طباعة</Button>}
          </>
        }
      >
        {zView && <ZReport z={zView} />}
      </Dialog>

      <Dialog
        open={setOpen}
        onClose={() => setSetOpen(false)}
        title="نِسَب الخدمة والضريبة"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSetOpen(false)}>إلغاء</Button>
            <Button onClick={saveSettings} loading={busy}>حفظ</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-muted">تُطبَّق تلقائيًا على كل فاتورة. اتركها صفرًا لتعطيلها.</p>
          <Field label="رسم الخدمة %">
            <Input type="number" step="0.1" min="0" value={svcPct} onChange={(e) => setSvcPct(e.target.value)} />
          </Field>
          <Field label="الضريبة %">
            <Input type="number" step="0.1" min="0" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} />
          </Field>

          <div className="mt-2 border-t border-white/10 pt-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-text">
              <input type="checkbox" checked={loyEnabled} onChange={(e) => setLoyEnabled(e.target.checked)} />
              تفعيل نظام الولاء (النقاط)
            </label>
            {loyEnabled && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Field label="نقاط لكل وحدة عملة">
                  <Input type="number" step="0.01" min="0" value={loyEarn} onChange={(e) => setLoyEarn(e.target.value)} placeholder="مثال: 0.1" />
                </Field>
                <Field label="قيمة النقطة عند الاستبدال">
                  <Input type="number" step="0.01" min="0" value={loyRedeem} onChange={(e) => setLoyRedeem(e.target.value)} placeholder="مثال: 1" />
                </Field>
              </div>
            )}
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function ZRow({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-muted">{label}</span>
      <span className={`${strong ? 'font-extrabold' : 'font-semibold'} ${tone || 'text-text'}`}>{value}</span>
    </div>
  );
}

function ZReport({ z }: { z: ShiftZ }) {
  return (
    <div className="divide-y divide-white/8">
      <div className="pb-2">
        <ZRow label="الحالة" value={z.status === 'closed' ? 'مغلقة' : 'مفتوحة'} />
        <ZRow label="فُتحت" value={fmtTime(z.opened_at)} />
        {z.closed_at && <ZRow label="أُغلقت" value={fmtTime(z.closed_at)} />}
        <ZRow label="الرصيد الافتتاحي" value={money(z.opening_float)} />
        <ZRow label="عدد الفواتير" value={String(z.bills)} />
      </div>
      <div className="py-2">
        <ZRow label="مبيعات صالة" value={money(z.dine_in)} />
        <ZRow label="مبيعات سفري" value={money(z.takeaway)} />
        <ZRow label="مبيعات توصيل" value={money(z.delivery)} />
        <ZRow label="إجمالي المبيعات" value={money(z.sales)} strong tone="text-gold" />
      </div>
      <div className="py-2">
        <ZRow label="نقدًا" value={money(z.cash_sales)} />
        <ZRow label="شبكة" value={money(z.card_sales)} />
      </div>
      <div className="pt-2">
        <ZRow label="النقد المتوقّع بالدرج" value={money(z.expected_cash)} />
        {z.declared_cash != null && <ZRow label="النقد المعلن (الجرد)" value={money(z.declared_cash)} />}
        {z.variance != null && (
          <ZRow
            label={z.variance < 0 ? 'عجز' : z.variance > 0 ? 'زيادة' : 'مطابق'}
            value={money(Math.abs(z.variance))}
            strong
            tone={z.variance < 0 ? 'text-danger' : z.variance > 0 ? 'text-warning' : 'text-success'}
          />
        )}
      </div>
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
  const [settings, setSettings] = useState<RestaurantSettings>({ service_pct: 0, tax_pct: 0 });
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'amount'>('none');
  const [discountValue, setDiscountValue] = useState('');
  const [tip, setTip] = useState('');
  const [loyPhone, setLoyPhone] = useState('');
  const [loyCust, setLoyCust] = useState<LoyaltyCustomer | null>(null);
  const [redeem, setRedeem] = useState('');
  const [loyBusy, setLoyBusy] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const [splitSel, setSplitSel] = useState<Set<string>>(new Set());
  const [voidTarget, setVoidTarget] = useState<{ id: string; name: string } | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);
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
    restaurantApi.settings(token).then(setSettings).catch(() => {});
  }, [token]);

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
      const r = await restaurantApi.closeBill(
        sessionId,
        pm,
        {
          discountType,
          discountValue: Number(discountValue) || 0,
          tip: Number(tip) || 0,
          customerId: loyCust?.id ?? null,
          redeemPoints: Number(redeem) || 0,
        },
        token
      );
      const earned = r.earned_points ?? 0;
      toast.success(`تم الدفع: ${money(r.charged ?? 0)}${earned ? ` — +${earned} نقطة` : ''}`);
      onBack();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setClosing(false);
      setPayOpen(false);
    }
  }

  async function lookupLoyalty() {
    if (!loyPhone.trim()) return;
    setLoyBusy(true);
    try {
      setLoyCust(await restaurantApi.loyaltyLookup(loyPhone.trim(), null, token));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoyBusy(false);
    }
  }

  async function doVoid() {
    if (!voidTarget || !voidReason.trim()) return;
    setVoiding(true);
    try {
      await restaurantApi.voidItem(voidTarget.id, voidReason.trim(), token);
      toast.success('أُلغي الصنف');
      setVoidTarget(null);
      setVoidReason('');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setVoiding(false);
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

  // معاينة الفاتورة عند الدفع (خصم/خدمة/ضريبة/إكرامية)
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const discAmt =
    discountType === 'percent'
      ? r2((s.total_sar * (Number(discountValue) || 0)) / 100)
      : discountType === 'amount'
      ? Math.min(Number(discountValue) || 0, s.total_sar)
      : 0;
  const netAmt = s.total_sar - discAmt;
  const serviceAmt = r2((netAmt * settings.service_pct) / 100);
  const taxAmt = r2(((netAmt + serviceAmt) * settings.tax_pct) / 100);
  const tipAmt = Number(tip) || 0;
  const grandPay = netAmt + serviceAmt + taxAmt + tipAmt + deliveryFee;
  const redeemCap = netAmt + serviceAmt + deliveryFee;
  const redeemVal =
    loyCust && settings.loyalty_enabled
      ? Math.min((Number(redeem) || 0) * (settings.loyalty_redeem_value || 0), redeemCap)
      : 0;
  const finalPay = grandPay - redeemVal;
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
                    {o.items.map((it) =>
                      it.voided ? (
                        <div key={it.id} className="flex items-center justify-between gap-2 py-0.5 text-sm text-muted/60">
                          <span className="flex items-center gap-2 line-through">
                            {it.qty}× {it.name}
                            <span className="rounded bg-danger/15 px-1 text-[9px] text-danger no-underline">
                              ملغى{it.void_reason ? `: ${it.void_reason}` : ''}
                            </span>
                          </span>
                          <span className="line-through">{money(it.line_total)}</span>
                        </div>
                      ) : (
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
                            {!splitMode && !token && (
                              <button
                                className="text-danger/70 hover:text-danger"
                                title="إلغاء الصنف"
                                onClick={() => {
                                  setVoidReason('');
                                  setVoidTarget({ id: it.id, name: it.name });
                                }}
                              >
                                <Ban size={13} />
                              </button>
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
                      )
                    )}
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

      {/* إلغاء صنف */}
      <Dialog
        open={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        title={`إلغاء صنف — ${voidTarget?.name ?? ''}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setVoidTarget(null)}>تراجع</Button>
            <Button variant="danger" onClick={doVoid} loading={voiding} disabled={!voidReason.trim()}>
              تأكيد الإلغاء
            </Button>
          </>
        }
      >
        <Field label="سبب الإلغاء (إلزامي)">
          <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="خطأ في الطلب، طلب الزبون..." autoFocus />
        </Field>
      </Dialog>

      {/* الدفع */}
      <Dialog open={payOpen} onClose={() => setPayOpen(false)} title="إقفال الفاتورة">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="نوع الخصم">
              <Select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as 'none' | 'percent' | 'amount')}
              >
                <option value="none">بدون</option>
                <option value="percent">نسبة %</option>
                <option value="amount">مبلغ</option>
              </Select>
            </Field>
            <Field label={discountType === 'percent' ? 'نسبة الخصم %' : 'قيمة الخصم'}>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={discountValue}
                disabled={discountType === 'none'}
                onChange={(e) => setDiscountValue(e.target.value)}
              />
            </Field>
          </div>
          <Field label="إكرامية (اختياري)">
            <Input type="number" step="0.01" min="0" value={tip} onChange={(e) => setTip(e.target.value)} />
          </Field>

          {settings.loyalty_enabled && (
            <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
              {!loyCust ? (
                <div className="flex items-end gap-2">
                  <Field label="هاتف زبون الولاء (اختياري)">
                    <Input value={loyPhone} onChange={(e) => setLoyPhone(e.target.value)} placeholder="09xxxxxxxx" />
                  </Field>
                  <Button size="sm" variant="outline" loading={loyBusy} onClick={lookupLoyalty}>بحث</Button>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-text">{loyCust.name}</span>
                    <span className="text-muted">الرصيد: <b className="text-gold">{loyCust.points}</b> نقطة</span>
                  </div>
                  {loyCust.points > 0 && (
                    <Field label={`استبدال نقاط (كل نقطة = ${money(loyCust.redeem_value)})`}>
                      <Input type="number" min="0" max={loyCust.points} value={redeem}
                        onChange={(e) => setRedeem(e.target.value)} placeholder="0" />
                    </Field>
                  )}
                  <button className="text-xs text-danger" onClick={() => { setLoyCust(null); setRedeem(''); setLoyPhone(''); }}>إزالة</button>
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm">
            <BillRow label="الأصناف" value={money(s.total_sar)} />
            {discAmt > 0 && <BillRow label="الخصم" value={`- ${money(discAmt)}`} tone="text-danger" />}
            {serviceAmt > 0 && <BillRow label={`خدمة ${settings.service_pct}%`} value={money(serviceAmt)} />}
            {taxAmt > 0 && <BillRow label={`ضريبة ${settings.tax_pct}%`} value={money(taxAmt)} />}
            {deliveryFee > 0 && <BillRow label="توصيل" value={money(deliveryFee)} />}
            {tipAmt > 0 && <BillRow label="إكرامية" value={money(tipAmt)} />}
            {redeemVal > 0 && <BillRow label="استبدال نقاط" value={`- ${money(redeemVal)}`} tone="text-success" />}
            <div className="mt-1.5 flex items-center justify-between border-t border-white/10 pt-1.5">
              <span className="font-extrabold text-text">الإجمالي</span>
              <span className="text-lg font-extrabold text-gold">{money(finalPay)}</span>
            </div>
          </div>

          <p className="text-sm text-muted">اختر طريقة الدفع:</p>
          <div className="grid grid-cols-2 gap-3">
            <Button loading={closing} onClick={() => closeBill('cash')}>
              نقدًا
            </Button>
            <Button variant="outline" loading={closing} onClick={() => closeBill('card')}>
              شبكة
            </Button>
          </div>
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

function BillRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted">{label}</span>
      <span className={tone || 'text-text'}>{value}</span>
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
