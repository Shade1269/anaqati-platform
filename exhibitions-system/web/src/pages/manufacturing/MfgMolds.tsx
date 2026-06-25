import { useEffect, useState } from 'react';
import { Component, Plus, Trash2 } from 'lucide-react';
import { mfgApi } from '../../lib/api';
import type { MfgMold, MfgProduct } from '../../lib/types';
import { Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, Spinner, Table, useToast } from '../../components/ui';

const empty = { id: null as string | null, name: '', cavities: '1', productId: '', note: '', active: true };

export default function MfgMolds() {
  const [rows, setRows] = useState<MfgMold[]>([]);
  const [products, setProducts] = useState<MfgProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...empty });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      const [m, p] = await Promise.all([mfgApi.moldsList(), mfgApi.productsList()]);
      setRows(m); setProducts(p);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await mfgApi.setMold(form.id, form.name.trim(), Number(form.cavities) || 1, form.productId || null, form.note.trim() || null, form.active);
      toast.success(form.id ? 'تم التعديل' : 'تمت الإضافة');
      setForm({ ...empty }); load();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }
  async function del(id: string) {
    if (!confirm('حذف القالب؟')) return;
    try { await mfgApi.deleteMold(id); load(); } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div>
      <PageHeader title="القوالب" subtitle="قوالب الحقن وعدد التجاويف" icon={<Component size={22} />} />
      <form onSubmit={save} className="mb-6">
        <Card>
          <CardHeader title={form.id ? 'تعديل قالب' : 'قالب جديد'} icon={<Plus size={18} />} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="اسم القالب"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="عدد التجاويف"><Input type="number" min={1} value={form.cavities} onChange={(e) => setForm({ ...form, cavities: e.target.value })} /></Field>
            <Field label="المنتج (اختياري)">
              <select className="ax-select" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
                <option value="">—</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <div className="flex items-end gap-2">
              <Button type="submit" className="flex-1" loading={saving}>{form.id ? 'حفظ' : 'إضافة'}</Button>
              {form.id && <Button type="button" variant="ghost" onClick={() => setForm({ ...empty })}>إلغاء</Button>}
            </div>
          </div>
        </Card>
      </form>
      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState message="لا قوالب بعد." /> : (
        <Table head={<><th>القالب</th><th>التجاويف</th><th>المنتج</th><th></th></>}>
          {rows.map((m) => (
            <tr key={m.id}>
              <td className="font-semibold">{m.name}</td>
              <td>{m.cavities}</td>
              <td className="text-muted">{m.product || '—'}</td>
              <td>
                <div className="flex items-center justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setForm({ id: m.id, name: m.name, cavities: String(m.cavities), productId: m.product_id || '', note: m.note || '', active: m.is_active })}>تعديل</Button>
                  <button className="p-1 text-danger" onClick={() => del(m.id)}><Trash2 size={15} /></button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
