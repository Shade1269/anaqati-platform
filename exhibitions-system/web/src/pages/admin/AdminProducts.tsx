import { useEffect, useState } from 'react';
import { Package, Plus, Pencil, Ruler, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import type {
  Category,
  ProductAdmin,
  ProductUom,
  Supplier,
} from '../../lib/types';
import {
  Button,
  Dialog,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  StatusBadge,
  Table,
  useToast,
} from '../../components/ui';
import { sar } from '../../lib/format';

interface Form {
  id?: string;
  product_code: string;
  name: string;
  category_id: string;
  sale_price_ref: string;
  cost_price_sar: string;
  supplier_id: string;
  base_unit: string;
  is_active: boolean;
}

const emptyForm: Form = {
  product_code: '',
  name: '',
  category_id: '',
  sale_price_ref: '',
  cost_price_sar: '',
  supplier_id: '',
  base_unit: 'وحدة',
  is_active: true,
};

export default function AdminProducts() {
  const [products, setProducts] = useState<ProductAdmin[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [uomFor, setUomFor] = useState<ProductAdmin | null>(null);
  const toast = useToast();

  async function load() {
    setLoading(true);
    const [p, c, s] = await Promise.all([
      supabase
        .from('products')
        .select(
          'id,product_code,name,category_id,sale_price_ref,cost_price_sar,supplier_id,base_unit,is_active'
        )
        .order('name'),
      supabase.from('categories').select('id,name,parent_id').order('name'),
      supabase.from('suppliers').select('id,name,phone,notes').order('name'),
    ]);
    if (p.error) setError(p.error.message);
    else setProducts((p.data as ProductAdmin[]) || []);
    if (!c.error) setCategories((c.data as Category[]) || []);
    if (!s.error) setSuppliers((s.data as Supplier[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dialog) return;
    setSaving(true);
    const payload = {
      product_code: dialog.product_code.trim(),
      name: dialog.name.trim(),
      category_id: dialog.category_id || null,
      sale_price_ref: dialog.sale_price_ref ? Number(dialog.sale_price_ref) : null,
      cost_price_sar: dialog.cost_price_sar ? Number(dialog.cost_price_sar) : null,
      supplier_id: dialog.supplier_id || null,
      base_unit: dialog.base_unit.trim() || 'وحدة',
      is_active: dialog.is_active,
    };
    try {
      const res = dialog.id
        ? await supabase.from('products').update(payload).eq('id', dialog.id)
        : await supabase.from('products').insert(payload);
      if (res.error) throw new Error(res.error.message);
      toast.success(dialog.id ? 'تم تحديث المنتج' : 'تمت إضافة المنتج');
      setDialog(null);
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: ProductAdmin) {
    const { error: e } = await supabase
      .from('products')
      .update({ is_active: !p.is_active })
      .eq('id', p.id);
    if (e) toast.error(e.message);
    else {
      toast.success(p.is_active ? 'تم إيقاف المنتج' : 'تم تفعيل المنتج');
      load();
    }
  }

  const catName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name || '—';

  return (
    <div>
      <PageHeader
        title="المنتجات"
        subtitle="إدارة المنتجات — التكلفة مرئية للأدمن فقط"
        icon={<Package size={22} />}
        action={
          <Button icon={<Plus size={16} />} onClick={() => setDialog({ ...emptyForm })}>
            منتج جديد
          </Button>
        }
      />
      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : products.length === 0 ? (
        <EmptyState message="لا توجد منتجات" icon={<Package size={26} />} />
      ) : (
        <Table
          head={
            <>
              <th>الكود</th>
              <th>الاسم</th>
              <th>الفئة</th>
              <th>السعر</th>
              <th>التكلفة</th>
              <th>الحالة</th>
              <th></th>
            </>
          }
        >
          {products.map((p) => (
            <tr key={p.id}>
              <td className="font-mono text-muted">{p.product_code}</td>
              <td className="font-semibold">{p.name}</td>
              <td className="text-muted">{catName(p.category_id)}</td>
              <td>{p.sale_price_ref != null ? sar(p.sale_price_ref) : '—'}</td>
              <td className="text-gold">
                {p.cost_price_sar != null ? sar(p.cost_price_sar) : '—'}
              </td>
              <td>
                <StatusBadge status={p.is_active ? 'active' : 'closed'} />
              </td>
              <td>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Pencil size={13} />}
                    onClick={() =>
                      setDialog({
                        id: p.id,
                        product_code: p.product_code,
                        name: p.name,
                        category_id: p.category_id || '',
                        sale_price_ref:
                          p.sale_price_ref != null ? String(p.sale_price_ref) : '',
                        cost_price_sar:
                          p.cost_price_sar != null ? String(p.cost_price_sar) : '',
                        supplier_id: p.supplier_id || '',
                        base_unit: p.base_unit || 'وحدة',
                        is_active: p.is_active,
                      })
                    }
                  >
                    تعديل
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Ruler size={13} />}
                    onClick={() => setUomFor(p)}
                  >
                    الوحدات
                  </Button>
                  <Button
                    size="sm"
                    variant={p.is_active ? 'danger' : 'success'}
                    onClick={() => toggleActive(p)}
                  >
                    {p.is_active ? 'إيقاف' : 'تفعيل'}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Dialog
        open={!!dialog}
        onClose={() => setDialog(null)}
        title={dialog?.id ? 'تعديل منتج' : 'منتج جديد'}
      >
        {dialog && (
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="كود المنتج">
              <Input
                value={dialog.product_code}
                onChange={(e) => setDialog({ ...dialog, product_code: e.target.value })}
                required
              />
            </Field>
            <Field label="الاسم">
              <Input
                value={dialog.name}
                onChange={(e) => setDialog({ ...dialog, name: e.target.value })}
                required
              />
            </Field>
            <Field label="الفئة">
              <Select
                value={dialog.category_id}
                onChange={(e) => setDialog({ ...dialog, category_id: e.target.value })}
              >
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="المورد">
              <Select
                value={dialog.supplier_id}
                onChange={(e) => setDialog({ ...dialog, supplier_id: e.target.value })}
              >
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="السعر المرجعي">
              <Input
                type="number"
                step="0.01"
                value={dialog.sale_price_ref}
                onChange={(e) =>
                  setDialog({ ...dialog, sale_price_ref: e.target.value })
                }
              />
            </Field>
            <Field label="سعر التكلفة (سري)">
              <Input
                type="number"
                step="0.01"
                value={dialog.cost_price_sar}
                onChange={(e) =>
                  setDialog({ ...dialog, cost_price_sar: e.target.value })
                }
              />
            </Field>
            <Field label="الوحدة الأساس (وحدة/علبة/كيلو)">
              <Input
                value={dialog.base_unit}
                onChange={(e) => setDialog({ ...dialog, base_unit: e.target.value })}
                placeholder="وحدة"
              />
            </Field>
            <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={dialog.is_active}
                onChange={(e) => setDialog({ ...dialog, is_active: e.target.checked })}
              />
              <span className="text-sm text-muted">مفعّل</span>
            </label>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>
                إلغاء
              </Button>
              <Button type="submit" loading={saving}>
                حفظ
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      {uomFor && (
        <UomDialog
          product={uomFor}
          onClose={() => setUomFor(null)}
          onSaved={(base) => {
            // عكس الوحدة الأساس محليًا في القائمة
            setProducts((list) =>
              list.map((x) =>
                x.id === uomFor.id ? { ...x, base_unit: base } : x
              )
            );
          }}
        />
      )}
    </div>
  );
}

interface UnitRow {
  unit_name: string;
  factor: string;
  barcode: string;
}

function UomDialog({
  product,
  onClose,
  onSaved,
}: {
  product: ProductAdmin;
  onClose: () => void;
  onSaved: (baseUnit: string) => void;
}) {
  const toast = useToast();
  const [baseUnit, setBaseUnit] = useState(product.base_unit || 'وحدة');
  const [rows, setRows] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi
      .uomList(product.id)
      .then((res) => {
        setBaseUnit(res.base_unit);
        setRows(
          res.units.map((u: ProductUom) => ({
            unit_name: u.unit_name,
            factor: String(u.factor),
            barcode: u.barcode || '',
          }))
        );
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  function addRow() {
    setRows((r) => [...r, { unit_name: '', factor: '', barcode: '' }]);
  }
  function update(i: number, patch: Partial<UnitRow>) {
    setRows((r) => r.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function remove(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  async function save() {
    const base = baseUnit.trim();
    if (!base) return toast.error('الوحدة الأساس مطلوبة');
    const units: { unit_name: string; factor: number; barcode?: string | null }[] =
      [];
    for (const r of rows) {
      const name = r.unit_name.trim();
      const factor = Number(r.factor);
      if (!name) continue;
      if (!factor || factor <= 0)
        return toast.error(`معامل التحويل غير صحيح للوحدة «${name}»`);
      if (name === base)
        return toast.error('اسم الوحدة لا يجوز أن يساوي الوحدة الأساس');
      units.push({ unit_name: name, factor, barcode: r.barcode.trim() || null });
    }
    setSaving(true);
    try {
      await adminApi.uomSet(product.id, base, units);
      toast.success('تم حفظ وحدات القياس');
      onSaved(base);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={`وحدات القياس — ${product.name}`} size="md">
      {loading ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <Field label="الوحدة الأساس (يُخزَّن المخزون بها)">
            <Input
              value={baseUnit}
              onChange={(e) => setBaseUnit(e.target.value)}
              placeholder="وحدة"
            />
          </Field>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">
                وحدات بديلة (معامل التحويل = كم وحدة أساس في وحدة واحدة)
              </p>
              <Button size="sm" variant="outline" icon={<Plus size={13} />} onClick={addRow}>
                إضافة وحدة
              </Button>
            </div>
            {rows.length === 0 ? (
              <p className="rounded-lg bg-bg-2 px-3 py-4 text-center text-sm text-muted">
                لا توجد وحدات بديلة — أضف مثلًا «كرتون» بمعامل 24 إذا كان الكرتون 24 علبة.
              </p>
            ) : (
              <div className="space-y-2">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <Field label="اسم الوحدة" className="flex-1">
                      <Input
                        value={r.unit_name}
                        onChange={(e) => update(i, { unit_name: e.target.value })}
                        placeholder="كرتون"
                      />
                    </Field>
                    <Field label="المعامل" className="w-24">
                      <Input
                        type="number"
                        step="0.0001"
                        value={r.factor}
                        onChange={(e) => update(i, { factor: e.target.value })}
                        placeholder="24"
                      />
                    </Field>
                    <Field label="باركود (اختياري)" className="flex-1">
                      <Input
                        value={r.barcode}
                        onChange={(e) => update(i, { barcode: e.target.value })}
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
          </div>

          <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
            <Button variant="ghost" onClick={onClose}>
              إلغاء
            </Button>
            <Button loading={saving} onClick={save}>
              حفظ الوحدات
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
