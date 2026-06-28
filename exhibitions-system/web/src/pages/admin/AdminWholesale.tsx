import { useEffect, useMemo, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import type { PriceList, ProductPublic, Warehouse } from '../../lib/types';
import ProductLinePicker, {
  type Line,
  type LineProduct,
  type UnitOption,
} from '../../components/ProductLinePicker';
import {
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  useToast,
} from '../../components/ui';
import { sar } from '../../lib/format';

export default function AdminWholesale() {
  const [products, setProducts] = useState<ProductPublic[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [payment, setPayment] = useState('cash');
  const [lines, setLines] = useState<Line[]>([]);
  const [unitsByProduct, setUnitsByProduct] = useState<
    Record<string, UnitOption[]>
  >({});
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [priceListId, setPriceListId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // يحلّ أسعار الأسطر تلقائيًا من قائمة الأسعار المختارة (حسب الكمية والوحدة).
  async function applyPrices(curLines: Line[], listId: string) {
    if (!listId || curLines.length === 0) return;
    try {
      const resolved = await Promise.all(
        curLines.map((l) =>
          adminApi
            .resolvePrice(l.product_id, l.uom_id ?? null, l.qty || 1, listId)
            .catch(() => l.unit_price ?? 0)
        )
      );
      setLines((cur) =>
        cur.map((l) => {
          const idx = curLines.findIndex((c) => c.product_id === l.product_id);
          return idx >= 0 ? { ...l, unit_price: resolved[idx] } : l;
        })
      );
    } catch {
      /* تجاهل — يبقى السعر اليدوي */
    }
  }

  // عند تغيّر الأسطر، حمّل وحدات القياس لأي منتج جديد لم تُحمّل وحداته بعد.
  function handleLinesChange(next: Line[]) {
    setLines(next);
    if (priceListId) applyPrices(next, priceListId);
    const missing = next
      .map((l) => l.product_id)
      .filter((id) => !(id in unitsByProduct));
    missing.forEach((id) => {
      setUnitsByProduct((m) => ({ ...m, [id]: m[id] ?? [] })); // علّمه كمحمّل لتفادي التكرار
      adminApi
        .uomList(id)
        .then((res) => {
          const opts: UnitOption[] = [
            { id: null, label: res.base_unit, factor: 1 },
            ...res.units.map((u) => ({
              id: u.id,
              label: u.unit_name,
              factor: u.factor,
            })),
          ];
          setUnitsByProduct((m) => ({ ...m, [id]: opts }));
        })
        .catch(() => {
          /* الوحدة الأساس فقط عند الفشل */
        });
    });
  }

  useEffect(() => {
    Promise.all([
      supabase
        .from('products_public')
        .select('id,product_code,name,category_id,sale_price_ref,is_active')
        .order('name'),
      supabase.from('warehouses').select('id,name,location,is_active').order('name'),
    ]).then(([p, w]) => {
      if (p.error) toast.error(p.error.message);
      setProducts((p.data as ProductPublic[]) || []);
      setWarehouses((w.data as Warehouse[]) || []);
      adminApi
        .priceLists()
        .then((pl) => setPriceLists(pl.filter((x) => x.is_active)))
        .catch(() => setPriceLists([]));
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lineProducts: LineProduct[] = useMemo(
    () =>
      products.map((p) => ({
        id: p.id,
        code: p.product_code,
        name: p.name,
        price_ref: p.sale_price_ref,
      })),
    [products]
  );

  const total = useMemo(
    () => lines.reduce((s, l) => s + (l.unit_price ?? 0) * l.qty, 0),
    [lines]
  );

  async function submit() {
    if (!warehouseId) return toast.error('اختر المستودع');
    if (lines.length === 0) return toast.error('أضف منتجًا واحدًا على الأقل');
    setSubmitting(true);
    try {
      const res = await adminApi.createWholesaleOrder(
        customerName.trim(),
        customerPhone.trim(),
        warehouseId,
        payment,
        lines.map((l) => ({
          product_id: l.product_id,
          qty: l.qty,
          unit_price: l.unit_price ?? 0,
          uom_id: l.uom_id ?? null,
        }))
      );
      toast.success(`تم إنشاء طلب الجملة — الإجمالي ${sar(res.total)}`);
      setLines([]);
      setCustomerName('');
      setCustomerPhone('');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="الجملة"
        subtitle="إنشاء طلب بيع بالجملة"
        icon={<ShoppingCart size={22} />}
      />

      <Card className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="اسم العميل">
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </Field>
          <Field label="جوال العميل">
            <Input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          </Field>
          <Field label="المستودع">
            <Select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">—</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="طريقة الدفع">
            <Select value={payment} onChange={(e) => setPayment(e.target.value)}>
              <option value="cash">نقدًا</option>
              <option value="card">شبكة</option>
            </Select>
          </Field>
          {priceLists.length > 0 && (
            <Field label="قائمة الأسعار">
              <Select
                value={priceListId}
                onChange={(e) => {
                  const v = e.target.value;
                  setPriceListId(v);
                  applyPrices(lines, v);
                }}
              >
                <option value="">— يدوي —</option>
                {priceLists.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        <ProductLinePicker
          products={lineProducts}
          lines={lines}
          onChange={handleLinesChange}
          withPrice
          withUom
          unitsByProduct={unitsByProduct}
        />

        <div className="flex items-center justify-between border-t border-white/10 pt-4">
          <span className="text-lg font-bold text-text">
            الإجمالي: <span className="text-gold">{sar(total)}</span>
          </span>
          <Button loading={submitting} onClick={submit}>
            إنشاء الطلب
          </Button>
        </div>
      </Card>
    </div>
  );
}
