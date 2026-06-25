import { useEffect, useState } from 'react';
import { Store, Plus, Trash2 } from 'lucide-react';
import { marketApi } from '../../lib/api';
import type { MarketListing } from '../../lib/types';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Spinner,
  Table,
  useToast,
} from '../../components/ui';

const money = (n: number) => `${(n || 0).toFixed(2)} ر.س`;
const empty = {
  id: null as string | null,
  name: '',
  category: '',
  description: '',
  unit: 'قطعة',
  price: '',
  minQty: '1',
  active: true,
};

export default function MarketMyListings() {
  const [rows, setRows] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...empty });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      setRows(await marketApi.myListings());
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

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await marketApi.setListing(
        form.id,
        form.name.trim(),
        form.category.trim() || null,
        form.description.trim() || null,
        form.unit.trim() || 'قطعة',
        Number(form.price) || 0,
        Number(form.minQty) || 1,
        null,
        form.active
      );
      toast.success(form.id ? 'تم التعديل' : 'تمت الإضافة');
      setForm({ ...empty });
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function del(id: string) {
    if (!confirm('حذف المنتج من السوق؟')) return;
    try {
      await marketApi.deleteListing(id);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="منتجاتي في السوق"
        subtitle="المنتجات التي تعرضها لبقية المشتركين"
        icon={<Store size={22} />}
      />

      <form onSubmit={save} className="mb-6">
        <Card>
          <CardHeader title={form.id ? 'تعديل منتج' : 'منتج جديد'} icon={<Plus size={18} />} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="اسم المنتج">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="التصنيف">
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="مشروبات / مواد خام..." />
            </Field>
            <Field label="الوحدة">
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="كرتون / كغ" />
            </Field>
            <Field label="السعر">
              <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </Field>
            <Field label="أقل كمية للطلب">
              <Input type="number" step="0.001" value={form.minQty} onChange={(e) => setForm({ ...form, minQty: e.target.value })} />
            </Field>
            <Field label="وصف (اختياري)">
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              معروض للسوق
            </label>
            <Button type="submit" loading={saving}>
              {form.id ? 'حفظ' : 'إضافة'}
            </Button>
            {form.id && (
              <Button type="button" variant="ghost" onClick={() => setForm({ ...empty })}>
                إلغاء
              </Button>
            )}
          </div>
        </Card>
      </form>

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState message="لا منتجات معروضة بعد." />
      ) : (
        <Table
          head={
            <>
              <th>المنتج</th>
              <th>التصنيف</th>
              <th>السعر</th>
              <th>أقل كمية</th>
              <th>الحالة</th>
              <th></th>
            </>
          }
        >
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="font-semibold">{r.name}</td>
              <td className="text-muted">{r.category || '—'}</td>
              <td>{money(r.price)}</td>
              <td className="text-muted">{r.min_order_qty} {r.unit}</td>
              <td>{r.is_active ? 'معروض' : 'موقوف'}</td>
              <td>
                <div className="flex items-center justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setForm({
                        id: r.id,
                        name: r.name,
                        category: r.category || '',
                        description: r.description || '',
                        unit: r.unit,
                        price: String(r.price),
                        minQty: String(r.min_order_qty),
                        active: r.is_active,
                      })
                    }
                  >
                    تعديل
                  </Button>
                  <button className="p-1 text-danger" onClick={() => del(r.id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
