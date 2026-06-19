import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Category, ProductAdmin, Supplier } from '../../lib/types';
import {
  Empty,
  ErrorBox,
  PageTitle,
  Spinner,
  SuccessBox,
} from '../../components/ui';
import { sar } from '../../lib/format';

const emptyForm = {
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
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

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

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const { error: e2 } = await supabase.from('products').insert({
        product_code: form.product_code.trim(),
        name: form.name.trim(),
        category_id: form.category_id || null,
        sale_price_ref: form.sale_price_ref ? Number(form.sale_price_ref) : null,
        cost_price_sar: form.cost_price_sar ? Number(form.cost_price_sar) : null,
        supplier_id: form.supplier_id || null,
        is_active: form.is_active,
      });
      if (e2) throw new Error(e2.message);
      setSuccess('تمت إضافة المنتج');
      setForm({ ...emptyForm });
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const catName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name || '—';

  return (
    <div>
      <PageTitle title="المنتجات" subtitle="إدارة المنتجات (التكلفة مرئية للأدمن فقط)" />
      <ErrorBox message={error} />
      <SuccessBox message={success} />

      <form onSubmit={create} className="card mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="label">كود المنتج</label>
          <input
            className="input"
            value={form.product_code}
            onChange={(e) => setForm({ ...form, product_code: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">الاسم</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">الفئة</label>
          <select
            className="input"
            value={form.category_id}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
          >
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">السعر المرجعي</label>
          <input
            type="number"
            step="0.01"
            className="input"
            value={form.sale_price_ref}
            onChange={(e) =>
              setForm({ ...form, sale_price_ref: e.target.value })
            }
          />
        </div>
        <div>
          <label className="label">سعر التكلفة (سري)</label>
          <input
            type="number"
            step="0.01"
            className="input"
            value={form.cost_price_sar}
            onChange={(e) =>
              setForm({ ...form, cost_price_sar: e.target.value })
            }
          />
        </div>
        <div>
          <label className="label">المورد</label>
          <select
            className="input"
            value={form.supplier_id}
            onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
          >
            <option value="">—</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="active"
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          <label htmlFor="active" className="text-sm text-slate-600">
            مفعّل
          </label>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <button className="btn-primary" disabled={saving}>
            {saving ? 'جارٍ الحفظ...' : 'إضافة منتج'}
          </button>
        </div>
      </form>

      {loading ? (
        <Spinner />
      ) : products.length === 0 ? (
        <Empty message="لا توجد منتجات" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>الكود</th>
                <th>الاسم</th>
                <th>الفئة</th>
                <th>السعر</th>
                <th>التكلفة</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>{p.product_code}</td>
                  <td>{p.name}</td>
                  <td>{catName(p.category_id)}</td>
                  <td>{p.sale_price_ref != null ? sar(p.sale_price_ref) : '—'}</td>
                  <td>{p.cost_price_sar != null ? sar(p.cost_price_sar) : '—'}</td>
                  <td>
                    <span
                      className={`badge ${
                        p.is_active
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {p.is_active ? 'مفعّل' : 'موقوف'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
