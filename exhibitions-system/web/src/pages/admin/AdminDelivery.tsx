import { useEffect, useMemo, useState } from 'react';
import { Truck, Plus, Route as RouteIcon, PackagePlus, Receipt } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminApi, customersApi } from '../../lib/api';
import type {
  Customer,
  DeliveryRoute,
  DeliveryRow,
  ProductPublic,
  RouteDetail,
  VanStockRow,
  Warehouse,
} from '../../lib/types';
import ProductLinePicker, {
  type Line,
  type LineProduct,
  type UnitOption,
} from '../../components/ProductLinePicker';
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Table,
  useToast,
} from '../../components/ui';
import { sar } from '../../lib/format';

interface Rep {
  id: string;
  full_name: string;
}

type Tab = 'routes' | 'van' | 'deliver' | 'log';

export default function AdminDelivery() {
  const [tab, setTab] = useState<Tab>('deliver');
  const [reps, setReps] = useState<Rep[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<ProductPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    (async () => {
      const [w, p, repRes] = await Promise.all([
        supabase.from('warehouses').select('id,name,location,is_active').order('name'),
        supabase
          .from('products_public')
          .select('id,product_code,name,category_id,sale_price_ref,is_active')
          .order('name'),
        supabase.from('profiles').select('id,full_name,role').neq('role', 'admin'),
      ]);
      setWarehouses((w.data as Warehouse[]) || []);
      setProducts((p.data as ProductPublic[]) || []);
      setReps(((repRes.data as Rep[]) || []).filter((r) => r.full_name));
      try {
        setCustomers(await customersApi.list());
      } catch (e) {
        toast.error((e as Error).message);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <Spinner />;

  const tabs: { key: Tab; label: string; icon: JSX.Element }[] = [
    { key: 'deliver', label: 'بيع وتوصيل', icon: <Receipt size={15} /> },
    { key: 'van', label: 'تحميل الشاحنة', icon: <PackagePlus size={15} /> },
    { key: 'routes', label: 'المسارات', icon: <RouteIcon size={15} /> },
    { key: 'log', label: 'سجل التوصيل', icon: <Truck size={15} /> },
  ];

  return (
    <div>
      <PageHeader
        title="التوزيع والمندوبون"
        subtitle="مسارات التوصيل، تحميل الشاحنات، والبيع الميداني (Van Sales)"
        icon={<Truck size={22} />}
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button
            key={t.key}
            variant={tab === t.key ? 'primary' : 'outline'}
            size="sm"
            icon={t.icon}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {tab === 'deliver' && (
        <DeliverTab reps={reps} customers={customers} products={products} />
      )}
      {tab === 'van' && (
        <VanTab reps={reps} warehouses={warehouses} products={products} />
      )}
      {tab === 'routes' && <RoutesTab reps={reps} customers={customers} />}
      {tab === 'log' && <LogTab />}
    </div>
  );
}

function useUomLoader() {
  const [unitsByProduct, setUnits] = useState<Record<string, UnitOption[]>>({});
  function ensure(ids: string[]) {
    ids
      .filter((id) => !(id in unitsByProduct))
      .forEach((id) => {
        setUnits((m) => ({ ...m, [id]: m[id] ?? [] }));
        adminApi
          .uomList(id)
          .then((res) => {
            const opts: UnitOption[] = [
              { id: null, label: res.base_unit, factor: 1 },
              ...res.units.map((u) => ({ id: u.id, label: u.unit_name, factor: u.factor })),
            ];
            setUnits((m) => ({ ...m, [id]: opts }));
          })
          .catch(() => {});
      });
  }
  return { unitsByProduct, ensure };
}

function lineProductsOf(products: ProductPublic[]): LineProduct[] {
  return products.map((p) => ({
    id: p.id,
    code: p.product_code,
    name: p.name,
    price_ref: p.sale_price_ref,
  }));
}

function DeliverTab({
  reps,
  customers,
  products,
}: {
  reps: Rep[];
  customers: Customer[];
  products: ProductPublic[];
}) {
  const toast = useToast();
  const [repId, setRepId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [payment, setPayment] = useState('cash');
  const [lines, setLines] = useState<Line[]>([]);
  const [van, setVan] = useState<VanStockRow[]>([]);
  const [busy, setBusy] = useState(false);
  const { unitsByProduct, ensure } = useUomLoader();

  useEffect(() => {
    if (repId) adminApi.repVanStock(repId).then(setVan).catch(() => setVan([]));
    else setVan([]);
  }, [repId]);

  function handleLines(next: Line[]) {
    setLines(next);
    ensure(next.map((l) => l.product_id));
  }

  const total = useMemo(
    () => lines.reduce((s, l) => s + (l.unit_price ?? 0) * l.qty, 0),
    [lines]
  );

  async function submit() {
    if (!repId) return toast.error('اختر المندوب');
    if (payment === 'credit' && !customerId)
      return toast.error('البيع بالدين يتطلب اختيار عميل');
    if (lines.length === 0) return toast.error('أضف صنفًا واحدًا على الأقل');
    setBusy(true);
    try {
      const res = await adminApi.recordDelivery(
        null,
        repId,
        customerId || null,
        payment,
        lines.map((l) => ({
          product_id: l.product_id,
          qty: l.qty,
          unit_price: l.unit_price ?? 0,
          uom_id: l.uom_id ?? null,
        })),
        null
      );
      toast.success(`تم تسجيل التوصيل — ${sar(res.total)}`);
      setLines([]);
      adminApi.repVanStock(repId).then(setVan).catch(() => {});
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="المندوب">
          <Select value={repId} onChange={(e) => setRepId(e.target.value)}>
            <option value="">—</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="العميل">
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">— (نقدي بلا عميل) —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="طريقة الدفع">
          <Select value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="cash">نقدًا</option>
            <option value="card">شبكة</option>
            <option value="credit">آجل (دين)</option>
          </Select>
        </Field>
      </div>

      {repId && (
        <div className="rounded-lg border border-white/10 bg-bg-2 p-3 text-xs text-muted">
          مخزون الشاحنة:{' '}
          {van.length === 0
            ? 'فارغ — حمّل الشاحنة أولًا'
            : van.map((v) => `${v.name}: ${v.quantity} ${v.base_unit}`).join(' · ')}
        </div>
      )}

      <ProductLinePicker
        products={lineProductsOf(products)}
        lines={lines}
        onChange={handleLines}
        withPrice
        withUom
        unitsByProduct={unitsByProduct}
      />

      <div className="flex items-center justify-between border-t border-white/10 pt-4">
        <span className="text-lg font-bold text-text">
          الإجمالي: <span className="text-gold">{sar(total)}</span>
        </span>
        <Button loading={busy} onClick={submit}>
          تسجيل التوصيل
        </Button>
      </div>
    </Card>
  );
}

function VanTab({
  reps,
  warehouses,
  products,
}: {
  reps: Rep[];
  warehouses: Warehouse[];
  products: ProductPublic[];
}) {
  const toast = useToast();
  const [repId, setRepId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [van, setVan] = useState<VanStockRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (repId) adminApi.repVanStock(repId).then(setVan).catch(() => setVan([]));
    else setVan([]);
  }, [repId]);

  async function submit() {
    if (!repId) return toast.error('اختر المندوب');
    if (!warehouseId) return toast.error('اختر المستودع');
    if (lines.length === 0) return toast.error('أضف صنفًا');
    setBusy(true);
    try {
      await adminApi.vanLoad(
        repId,
        warehouseId,
        lines.map((l) => ({ product_id: l.product_id, qty: l.qty }))
      );
      toast.success('تم تحميل الشاحنة');
      setLines([]);
      adminApi.repVanStock(repId).then(setVan).catch(() => {});
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="المندوب (الشاحنة)">
          <Select value={repId} onChange={(e) => setRepId(e.target.value)}>
            <option value="">—</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="المستودع المصدر">
          <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">—</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {repId && van.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-bg-2 p-3 text-xs text-muted">
          الموجود في الشاحنة:{' '}
          {van.map((v) => `${v.name}: ${v.quantity} ${v.base_unit}`).join(' · ')}
        </div>
      )}

      <ProductLinePicker
        products={lineProductsOf(products)}
        lines={lines}
        onChange={setLines}
      />

      <div className="flex justify-end border-t border-white/10 pt-4">
        <Button loading={busy} onClick={submit}>
          تحميل الشاحنة
        </Button>
      </div>
    </Card>
  );
}

function RoutesTab({ reps, customers }: { reps: Rep[]; customers: Customer[] }) {
  const toast = useToast();
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<DeliveryRoute | 'new' | null>(null);
  const [stopsFor, setStopsFor] = useState<DeliveryRoute | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRoutes(await adminApi.routesList());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button icon={<Plus size={16} />} onClick={() => setEdit('new')}>
          مسار جديد
        </Button>
      </div>
      {loading ? (
        <Spinner />
      ) : routes.length === 0 ? (
        <EmptyState message="لا توجد مسارات" icon={<RouteIcon size={26} />} />
      ) : (
        <Table
          head={
            <>
              <th>المسار</th>
              <th>المندوب</th>
              <th>المحطات</th>
              <th>الحالة</th>
              <th></th>
            </>
          }
        >
          {routes.map((r) => (
            <tr key={r.id}>
              <td className="font-semibold">{r.name}</td>
              <td className="text-muted">{r.rep_name || '—'}</td>
              <td className="text-muted">{r.stops_count}</td>
              <td>
                <Badge tone={r.is_active ? 'success' : 'neutral'}>
                  {r.is_active ? 'نشط' : 'موقوف'}
                </Badge>
              </td>
              <td>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setStopsFor(r)}>
                    المحطات
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEdit(r)}>
                    تعديل
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {edit && (
        <RouteEditDialog
          route={edit === 'new' ? null : edit}
          reps={reps}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            load();
          }}
        />
      )}
      {stopsFor && (
        <StopsDialog
          route={stopsFor}
          customers={customers}
          onClose={() => setStopsFor(null)}
          onSaved={() => {
            setStopsFor(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function RouteEditDialog({
  route,
  reps,
  onClose,
  onSaved,
}: {
  route: DeliveryRoute | null;
  reps: Rep[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(route?.name || '');
  const [repId, setRepId] = useState(route?.rep_id || '');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return toast.error('أدخل اسم المسار');
    setBusy(true);
    try {
      await adminApi.routeSet(route?.id || null, name.trim(), repId || null, true);
      toast.success('تم الحفظ');
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={route ? 'تعديل المسار' : 'مسار جديد'} size="sm">
      <div className="space-y-4">
        <Field label="اسم المسار">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="المندوب">
          <Select value={repId} onChange={(e) => setRepId(e.target.value)}>
            <option value="">—</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button loading={busy} onClick={save}>
            حفظ
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function StopsDialog({
  route,
  customers,
  onClose,
  onSaved,
}: {
  route: DeliveryRoute;
  customers: Customer[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [detail, setDetail] = useState<RouteDetail | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi
      .routeGet(route.id)
      .then((d) => {
        setDetail(d);
        setSelected(d.stops.map((s) => s.customer_id));
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.id]);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function save() {
    setBusy(true);
    try {
      await adminApi.routeStopsSet(route.id, selected);
      toast.success('تم حفظ المحطات');
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={`محطات — ${route.name}`} size="md">
      {loading || !detail ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted">
            اختر العملاء الذين يزورهم المندوب على هذا المسار (بالترتيب المحدد).
          </p>
          <div className="max-h-72 space-y-1 overflow-auto rounded-lg border border-white/10 bg-bg-2 p-2">
            {customers.map((c) => {
              const idx = selected.indexOf(c.id);
              return (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-white/5"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={idx >= 0}
                      onChange={() => toggle(c.id)}
                    />
                    <span className="text-text">{c.name}</span>
                    {c.phone && <span className="text-muted">({c.phone})</span>}
                  </span>
                  {idx >= 0 && <Badge tone="gold">#{idx + 1}</Badge>}
                </label>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
            <Button variant="ghost" onClick={onClose}>
              إلغاء
            </Button>
            <Button loading={busy} onClick={save}>
              حفظ المحطات
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function LogTab() {
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    adminApi
      .deliveriesList(null)
      .then(setRows)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const payLabel = (m: string) =>
    m === 'credit' ? 'آجل' : m === 'card' ? 'شبكة' : 'نقدًا';

  if (loading) return <Spinner />;
  if (rows.length === 0)
    return <EmptyState message="لا يوجد توصيلات بعد" icon={<Truck size={26} />} />;

  return (
    <Table
      head={
        <>
          <th>التاريخ</th>
          <th>العميل</th>
          <th>المندوب</th>
          <th>الدفع</th>
          <th>الإجمالي</th>
        </>
      }
    >
      {rows.map((d) => (
        <tr key={d.id}>
          <td className="text-muted whitespace-nowrap">
            {new Date(d.created_at).toLocaleDateString('ar')}
          </td>
          <td className="font-semibold">{d.customer_name || '—'}</td>
          <td className="text-muted">{d.rep_name || '—'}</td>
          <td>
            <Badge tone={d.payment_method === 'credit' ? 'warning' : 'success'}>
              {payLabel(d.payment_method)}
            </Badge>
          </td>
          <td className="font-bold text-gold">{sar(d.total_sar)}</td>
        </tr>
      ))}
    </Table>
  );
}
