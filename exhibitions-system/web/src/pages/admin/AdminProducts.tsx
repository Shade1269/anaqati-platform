import { useEffect, useState } from 'react';
import { Package, Plus, Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Category, ProductAdmin, Supplier } from '../../lib/types';
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
  is_active: boolean;
}

const emptyForm: Form = {
  product_code: '',
  name: '',
  category_id: '',
  sale_price_ref: '',
  cost_price_sar: '',
  supplier_id: '',
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
  const toast = useToast();

  async function load() {
    setLoading(true);
    const [p, c, s] = await Promise.all([
      supabase
        .from('products')
        .select(
          'id,product_code,name,category_id,sale_price_ref,cost_price_sar,supplier_id,is_active'
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
                        is_active: p.is_active,
                      })
                    }
                  >
                    تعديل
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
    </div>
  );
}
