import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import type { Branch, Warehouse } from '../../lib/types';
import {
  Empty,
  ErrorBox,
  PageTitle,
  Spinner,
  SuccessBox,
} from '../../components/ui';
import { sar } from '../../lib/format';

const emptyForm = {
  name: '',
  location: '',
  start_date: '',
  end_date: '',
  target_amount_sar: '',
  commission_percentage: '',
  commission_mode: '',
  source_warehouse_id: '',
};

const modeLabels: Record<string, string> = {
  single_manager: 'مدير واحد',
  proportional: 'تناسبي',
  manual_pool: 'تجميع يدوي',
};

export default function AdminBranches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [closingId, setClosingId] = useState('');

  async function load() {
    setLoading(true);
    const [b, w] = await Promise.all([
      supabase
        .from('branches')
        .select(
          'id,name,location,status,start_date,end_date,target_amount_sar,commission_percentage,commission_mode,source_warehouse_id'
        )
        .order('name'),
      supabase
        .from('warehouses')
        .select('id,name,location,is_active')
        .order('name'),
    ]);
    if (b.error) setError(b.error.message);
    setBranches((b.data as Branch[]) || []);
    setWarehouses((w.data as Warehouse[]) || []);
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
      const { error: e2 } = await supabase.from('branches').insert({
        name: form.name.trim(),
        location: form.location.trim() || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        target_amount_sar: form.target_amount_sar
          ? Number(form.target_amount_sar)
          : null,
        commission_percentage: form.commission_percentage
          ? Number(form.commission_percentage)
          : null,
        commission_mode: form.commission_mode || null,
        source_warehouse_id: form.source_warehouse_id || null,
        status: 'planning',
      });
      if (e2) throw new Error(e2.message);
      setSuccess('تمت إضافة المعرض');
      setForm({ ...emptyForm });
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function closeBranch(id: string) {
    setError('');
    setSuccess('');
    setClosingId(id);
    try {
      await adminApi.closeBranch(id);
      setSuccess('تم إغلاق المعرض');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setClosingId('');
    }
  }

  return (
    <div>
      <PageTitle title="المعارض" subtitle="إنشاء وإدارة المعارض المؤقتة" />
      <ErrorBox message={error} />
      <SuccessBox message={success} />

      <form
        onSubmit={create}
        className="card mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div>
          <label className="label">اسم المعرض</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">الموقع</label>
          <input
            className="input"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </div>
        <div>
          <label className="label">المستودع المصدر</label>
          <select
            className="input"
            value={form.source_warehouse_id}
            onChange={(e) =>
              setForm({ ...form, source_warehouse_id: e.target.value })
            }
          >
            <option value="">—</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">تاريخ البداية</label>
          <input
            type="date"
            className="input"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          />
        </div>
        <div>
          <label className="label">تاريخ النهاية</label>
          <input
            type="date"
            className="input"
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
          />
        </div>
        <div>
          <label className="label">الهدف (ر.س)</label>
          <input
            type="number"
            step="0.01"
            className="input"
            value={form.target_amount_sar}
            onChange={(e) =>
              setForm({ ...form, target_amount_sar: e.target.value })
            }
          />
        </div>
        <div>
          <label className="label">نسبة العمولة %</label>
          <input
            type="number"
            step="0.01"
            className="input"
            value={form.commission_percentage}
            onChange={(e) =>
              setForm({ ...form, commission_percentage: e.target.value })
            }
          />
        </div>
        <div>
          <label className="label">نمط العمولة</label>
          <select
            className="input"
            value={form.commission_mode}
            onChange={(e) =>
              setForm({ ...form, commission_mode: e.target.value })
            }
          >
            <option value="">—</option>
            <option value="single_manager">مدير واحد</option>
            <option value="proportional">تناسبي</option>
            <option value="manual_pool">تجميع يدوي</option>
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full" disabled={saving}>
            {saving ? 'جارٍ الحفظ...' : 'إضافة معرض'}
          </button>
        </div>
      </form>

      {loading ? (
        <Spinner />
      ) : branches.length === 0 ? (
        <Empty message="لا توجد معارض" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الموقع</th>
                <th>الهدف</th>
                <th>العمولة</th>
                <th>النمط</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{b.location || '—'}</td>
                  <td>{sar(b.target_amount_sar || 0)}</td>
                  <td>
                    {b.commission_percentage != null
                      ? `${b.commission_percentage}%`
                      : '—'}
                  </td>
                  <td>
                    {b.commission_mode
                      ? modeLabels[b.commission_mode] || b.commission_mode
                      : '—'}
                  </td>
                  <td>
                    <span className="badge bg-slate-100 text-slate-600">
                      {b.status}
                    </span>
                  </td>
                  <td>
                    {b.status !== 'closed' && (
                      <button
                        className="btn-danger"
                        onClick={() => closeBranch(b.id)}
                        disabled={closingId === b.id}
                      >
                        {closingId === b.id ? '...' : 'إغلاق'}
                      </button>
                    )}
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
