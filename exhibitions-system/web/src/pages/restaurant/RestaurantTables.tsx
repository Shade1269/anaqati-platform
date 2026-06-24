import { useEffect, useState } from 'react';
import { Armchair, Plus } from 'lucide-react';
import { restaurantApi } from '../../lib/api';
import type { DiningTable } from '../../lib/types';
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

const empty = { id: null as string | null, label: '', section: '', seats: '4', active: true };

export default function RestaurantTables() {
  const [rows, setRows] = useState<DiningTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...empty });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      setRows(await restaurantApi.tables(null));
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
      await restaurantApi.setTable(
        form.id,
        form.label.trim(),
        form.section.trim() || null,
        Number(form.seats) || 4,
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

  return (
    <div>
      <PageHeader title="إدارة الطاولات" subtitle="أضِف طاولات المطعم وأقسامه" icon={<Armchair size={22} />} />

      <form onSubmit={save} className="mb-6">
        <Card>
          <CardHeader title={form.id ? 'تعديل طاولة' : 'طاولة جديدة'} icon={<Plus size={18} />} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="الاسم / الرقم">
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required />
            </Field>
            <Field label="القسم (اختياري)">
              <Input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} placeholder="صالة / تراس" />
            </Field>
            <Field label="عدد المقاعد">
              <Input type="number" min={1} value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} />
            </Field>
            <div className="flex items-end gap-2">
              <Button type="submit" className="flex-1" loading={saving}>
                {form.id ? 'حفظ' : 'إضافة'}
              </Button>
              {form.id && (
                <Button type="button" variant="ghost" onClick={() => setForm({ ...empty })}>
                  إلغاء
                </Button>
              )}
            </div>
          </div>
        </Card>
      </form>

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState message="لا توجد طاولات بعد." />
      ) : (
        <Table
          head={
            <>
              <th>الطاولة</th>
              <th>القسم</th>
              <th>المقاعد</th>
              <th>الحالة</th>
              <th></th>
            </>
          }
        >
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="font-semibold">{t.label}</td>
              <td className="text-muted">{t.section || '—'}</td>
              <td>{t.seats}</td>
              <td>{t.status === 'free' ? 'فاضية' : 'مشغولة'}</td>
              <td>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setForm({ id: t.id, label: t.label, section: t.section || '', seats: String(t.seats), active: t.is_active })
                  }
                >
                  تعديل
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
