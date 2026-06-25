import { useEffect, useState } from 'react';
import { Factory, Plus } from 'lucide-react';
import { mfgApi } from '../../lib/api';
import type { WorkCenter } from '../../lib/types';
import { Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, Spinner, Table, useToast } from '../../components/ui';

import { money } from '../../lib/format';
const empty = { id: null as string | null, name: '', rate: '0', active: true };

export default function MfgWorkCenters() {
  const [rows, setRows] = useState<WorkCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...empty });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function load() {
    setLoading(true);
    try { setRows(await mfgApi.workCentersList()); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await mfgApi.setWorkCenter(form.id, form.name.trim(), Number(form.rate) || 0, form.active);
      toast.success(form.id ? 'تم التعديل' : 'تمت الإضافة');
      setForm({ ...empty });
      load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <PageHeader title="محطات العمل" subtitle="المكنات/المحطات وسعر ساعة التشغيل (أوفرهيد)" icon={<Factory size={22} />} />
      <form onSubmit={save} className="mb-6">
        <Card>
          <CardHeader title={form.id ? 'تعديل محطة' : 'محطة جديدة'} icon={<Plus size={18} />} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="اسم المحطة"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="سعر الساعة (أوفرهيد)"><Input type="number" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></Field>
            <div className="flex items-end gap-2">
              <Button type="submit" className="flex-1" loading={saving}>{form.id ? 'حفظ' : 'إضافة'}</Button>
              {form.id && <Button type="button" variant="ghost" onClick={() => setForm({ ...empty })}>إلغاء</Button>}
            </div>
          </div>
        </Card>
      </form>
      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState message="لا محطات بعد." /> : (
        <Table head={<><th>المحطة</th><th>سعر الساعة</th><th></th></>}>
          {rows.map((w) => (
            <tr key={w.id}>
              <td className="font-semibold">{w.name}</td>
              <td className="text-muted">{money(w.hourly_rate)}</td>
              <td><Button size="sm" variant="ghost" onClick={() => setForm({ id: w.id, name: w.name, rate: String(w.hourly_rate), active: w.is_active })}>تعديل</Button></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
