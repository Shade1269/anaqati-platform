import { useEffect, useState } from 'react';
import { Tag, Plus, Pencil, Trash2, ListChecks } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import type { PriceList, PriceListItem, ProductPublic } from '../../lib/types';
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
  StatusBadge,
  Table,
  useToast,
} from '../../components/ui';

export default function AdminPriceLists() {
  const [lists, setLists] = useState<PriceList[]>([]);
  const [products, setProducts] = useState<ProductPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [nameDialog, setNameDialog] = useState<{ id: string | null; name: string } | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [itemsFor, setItemsFor] = useState<PriceList | null>(null);
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      const [l, p] = await Promise.all([
        adminApi.priceLists(),
        supabase
          .from('products_public')
          .select('id,product_code,name,category_id,sale_price_ref,is_active')
          .order('name'),
      ]);
      setLists(l);
      setProducts((p.data as ProductPublic[]) || []);
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

  async function saveName() {
    if (!nameDialog) return;
    setSaving(true);
    try {
      await adminApi.priceListSet(nameDialog.id, nameDialog.name.trim(), true);
      toast.success('تم الحفظ');
      setNameDialog(null);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="قوائم الأسعار"
        subtitle="تسعير متدرّج بالكمية لكل عميل/فئة (للجملة والسوق)"
        icon={<Tag size={22} />}
        action={
          <Button
            icon={<Plus size={16} />}
            onClick={() => setNameDialog({ id: null, name: '' })}
          >
            قائمة جديدة
          </Button>
        }
      />

      {lists.length === 0 ? (
        <EmptyState message="لا توجد قوائم أسعار بعد" icon={<Tag size={26} />} />
      ) : (
        <Table
          head={
            <>
              <th>الاسم</th>
              <th>عدد البنود</th>
              <th>الحالة</th>
              <th></th>
            </>
          }
        >
          {lists.map((l) => (
            <tr key={l.id}>
              <td className="font-semibold">{l.name}</td>
              <td className="text-muted">{l.items_count}</td>
              <td>
                <StatusBadge status={l.is_active ? 'active' : 'closed'} />
              </td>
              <td>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<ListChecks size={13} />}
                    onClick={() => setItemsFor(l)}
                  >
                    البنود والأسعار
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Pencil size={13} />}
                    onClick={() => setNameDialog({ id: l.id, name: l.name })}
                  >
                    تعديل
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Dialog
        open={!!nameDialog}
        onClose={() => setNameDialog(null)}
        title={nameDialog?.id ? 'تعديل القائمة' : 'قائمة أسعار جديدة'}
      >
        {nameDialog && (
          <div className="space-y-4">
            <Field label="اسم القائمة">
              <Input
                value={nameDialog.name}
                onChange={(e) =>
                  setNameDialog({ ...nameDialog, name: e.target.value })
                }
                placeholder="جملة كبار العملاء"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setNameDialog(null)}>
                إلغاء
              </Button>
              <Button loading={saving} onClick={saveName}>
                حفظ
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {itemsFor && (
        <ItemsDialog
          list={itemsFor}
          products={products}
          onClose={() => setItemsFor(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

interface Row {
  product_id: string;
  min_qty: string;
  unit_price: string;
}

function ItemsDialog({
  list,
  products,
  onClose,
  onSaved,
}: {
  list: PriceList;
  products: ProductPublic[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi
      .priceListItems(list.id)
      .then((items: PriceListItem[]) =>
        setRows(
          items.map((i) => ({
            product_id: i.product_id,
            min_qty: String(i.min_qty),
            unit_price: String(i.unit_price),
          }))
        )
      )
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.id]);

  function addRow() {
    setRows((r) => [...r, { product_id: '', min_qty: '1', unit_price: '' }]);
  }
  function update(i: number, patch: Partial<Row>) {
    setRows((r) => r.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function remove(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  async function save() {
    const items: { product_id: string; min_qty: number; unit_price: number }[] = [];
    for (const r of rows) {
      if (!r.product_id) continue;
      const min = Number(r.min_qty) || 1;
      const price = Number(r.unit_price);
      if (!(price >= 0))
        return toast.error('سعر غير صحيح في أحد البنود');
      items.push({ product_id: r.product_id, min_qty: min, unit_price: price });
    }
    setSaving(true);
    try {
      await adminApi.priceListItemsSet(list.id, items);
      toast.success('تم حفظ البنود');
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={`بنود — ${list.name}`} size="lg">
      {loading ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted">
            السعر لكل وحدة أساس. «الحدّ الأدنى» يحدد الشريحة بالوحدة الأساس — مثلًا
            صنف بسعر 10 من كمية 1، و8 من كمية 50. يمكن تكرار المنتج بشرائح مختلفة.
          </p>
          <Card className="space-y-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-bold text-text">البنود</span>
              <Button size="sm" variant="outline" icon={<Plus size={13} />} onClick={addRow}>
                إضافة بند
              </Button>
            </div>
            {rows.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">لا توجد بنود</p>
            ) : (
              <div className="space-y-2">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <Field label="المنتج" className="flex-1">
                      <Select
                        value={r.product_id}
                        onChange={(e) => update(i, { product_id: e.target.value })}
                      >
                        <option value="">—</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.product_code})
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="حد أدنى" className="w-24">
                      <Input
                        type="number"
                        step="0.001"
                        value={r.min_qty}
                        onChange={(e) => update(i, { min_qty: e.target.value })}
                      />
                    </Field>
                    <Field label="السعر/وحدة أساس" className="w-32">
                      <Input
                        type="number"
                        step="0.01"
                        value={r.unit_price}
                        onChange={(e) => update(i, { unit_price: e.target.value })}
                      />
                    </Field>
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      className="mb-1 rounded-lg p-2 text-danger transition hover:bg-danger/10"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
            <Button variant="ghost" onClick={onClose}>
              إلغاء
            </Button>
            <Button loading={saving} onClick={save}>
              حفظ البنود
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
