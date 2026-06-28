import { useEffect, useMemo, useRef, useState } from 'react';
import { ScanLine, Trash2, Banknote, CreditCard, CheckCircle2, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import type { Branch } from '../../lib/types';
import { Button, Card, Field, PageHeader, Select, Spinner, useToast } from '../../components/ui';
import { sar } from '../../lib/format';

interface CartLine {
  product_id: string;
  uom_id: string | null;
  name: string;
  code: string;
  unit: string;
  qty: number;
  unit_price: number;
}

export default function AdminCashier() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<'cash' | 'card'>('cash');
  const [paid, setPaid] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastChange, setLastChange] = useState<number | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    supabase
      .from('branches')
      .select('id,name,location,status,target_amount_sar')
      .order('name')
      .then(({ data }) => {
        const bs = (data as Branch[]) || [];
        setBranches(bs);
        if (bs.length >= 1) setBranchId(bs[0].id);
        setLoading(false);
        setTimeout(() => scanRef.current?.focus(), 100);
      });
  }, []);

  const total = useMemo(() => cart.reduce((s, l) => s + l.qty * l.unit_price, 0), [cart]);
  const change = useMemo(() => {
    const p = Number(paid);
    return payment === 'cash' && p > 0 ? p - total : null;
  }, [paid, total, payment]);

  async function scan(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim();
    if (!c) return;
    setScanning(true);
    try {
      const p = await adminApi.posLookup(c);
      if (!p) {
        toast.error(`لم يُعثر على صنف بالكود ${c}`);
      } else {
        setCart((cur) => {
          const idx = cur.findIndex((l) => l.product_id === p.id && l.uom_id === p.uom_id);
          if (idx >= 0) {
            const next = [...cur];
            next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
            return next;
          }
          return [
            ...cur,
            {
              product_id: p.id,
              uom_id: p.uom_id,
              name: p.name,
              code: p.product_code,
              unit: p.base_unit,
              qty: 1,
              unit_price: p.sale_price_ref || 0,
            },
          ];
        });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setScanning(false);
      setCode('');
      scanRef.current?.focus();
    }
  }

  function update(i: number, patch: Partial<CartLine>) {
    setCart((c) => c.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function remove(i: number) {
    setCart((c) => c.filter((_, idx) => idx !== i));
  }

  async function checkout() {
    if (!branchId) return toast.error('اختر المتجر');
    if (cart.length === 0) return toast.error('السلة فارغة');
    setBusy(true);
    try {
      const res = await adminApi.posSale(
        branchId,
        payment,
        cart.map((l) => ({
          product_id: l.product_id,
          qty: l.qty,
          unit_price: l.unit_price,
          uom_id: l.uom_id,
        }))
      );
      setLastChange(change != null && change >= 0 ? change : null);
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
        subtitle="امسح الباركود أو أدخل الكود ثم Enter"
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
          لا يوجد فرع/متجر بعد — أنشئ متجرًا من «المتجر/الفروع» أولًا ليتمكّن الكاشير من البيع منه.
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* السلة */}
        <div className="lg:col-span-2">
          <Card>
            <form onSubmit={scan} className="mb-4 flex gap-2">
              <div className="relative flex-1">
                <ScanLine size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-primary-hover" />
                <input
                  ref={scanRef}
                  className="ax-input w-full pr-10 text-lg"
                  placeholder="امسح الباركود أو اكتب الكود ثم اضغط Enter"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  dir="ltr"
                />
              </div>
              <Button type="submit" icon={<Plus size={16} />} loading={scanning}>
                إضافة
              </Button>
            </form>

            {cart.length === 0 ? (
              <p className="py-10 text-center text-muted">السلة فارغة — ابدأ بمسح صنف</p>
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
                          {l.name}{' '}
                          <span className="font-mono text-xs text-muted">({l.code})</span>
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

        {/* الدفع */}
        <div>
          <Card className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-muted">الإجمالي</span>
              <span className="text-2xl font-bold text-gold">{sar(total)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={payment === 'cash' ? 'primary' : 'outline'}
                icon={<Banknote size={16} />}
                onClick={() => setPayment('cash')}
              >
                نقدًا
              </Button>
              <Button
                variant={payment === 'card' ? 'primary' : 'outline'}
                icon={<CreditCard size={16} />}
                onClick={() => setPayment('card')}
              >
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

            <Button
              className="w-full"
              icon={<CheckCircle2 size={18} />}
              loading={busy}
              disabled={cart.length === 0 || !branchId}
              onClick={checkout}
            >
              إتمام البيع
            </Button>

            {lastChange != null && (
              <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-center text-sm">
                <span className="text-muted">باقي العملية السابقة: </span>
                <span className="font-bold text-success">{sar(lastChange)}</span>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
