import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Category, Supplier, Warehouse } from '../../lib/types';
import {
  Empty,
  ErrorBox,
  PageTitle,
  Spinner,
  SuccessBox,
} from '../../components/ui';

export default function AdminCatalog() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [catName, setCatName] = useState('');
  const [supName, setSupName] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [whName, setWhName] = useState('');
  const [whLoc, setWhLoc] = useState('');

  async function load() {
    setLoading(true);
    const [c, s, w] = await Promise.all([
      supabase.from('categories').select('id,name,parent_id').order('name'),
      supabase.from('suppliers').select('id,name,phone,notes').order('name'),
      supabase
        .from('warehouses')
        .select('id,name,location,is_active')
        .order('name'),
    ]);
    if (c.error) setError(c.error.message);
    setCategories((c.data as Category[]) || []);
    setSuppliers((s.data as Supplier[]) || []);
    setWarehouses((w.data as Warehouse[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function run(
    promise: PromiseLike<{ error: { message: string } | null }>,
    msg: string
  ) {
    setError('');
    setSuccess('');
    const { error: e } = await promise;
    if (e) setError(e.message);
    else {
      setSuccess(msg);
      load();
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageTitle title="الكتالوج" subtitle="الفئات والموردون والمستودعات" />
      <ErrorBox message={error} />
      <SuccessBox message={success} />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Categories */}
        <div className="card space-y-4">
          <h2 className="font-bold text-slate-800">الفئات</h2>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                supabase.from('categories').insert({ name: catName.trim() }),
                'تمت إضافة الفئة'
              );
              setCatName('');
            }}
          >
            <input
              className="input"
              placeholder="اسم الفئة"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              required
            />
            <button className="btn-primary">إضافة</button>
          </form>
          {categories.length === 0 ? (
            <Empty />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {categories.map((c) => (
                <li key={c.id} className="py-2">
                  {c.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Suppliers */}
        <div className="card space-y-4">
          <h2 className="font-bold text-slate-800">الموردون</h2>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                supabase.from('suppliers').insert({
                  name: supName.trim(),
                  phone: supPhone.trim() || null,
                }),
                'تمت إضافة المورد'
              );
              setSupName('');
              setSupPhone('');
            }}
          >
            <input
              className="input"
              placeholder="اسم المورد"
              value={supName}
              onChange={(e) => setSupName(e.target.value)}
              required
            />
            <input
              className="input"
              placeholder="الجوال"
              value={supPhone}
              onChange={(e) => setSupPhone(e.target.value)}
            />
            <button className="btn-primary w-full">إضافة</button>
          </form>
          {suppliers.length === 0 ? (
            <Empty />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {suppliers.map((s) => (
                <li key={s.id} className="flex justify-between py-2">
                  <span>{s.name}</span>
                  <span className="text-slate-400">{s.phone || ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Warehouses */}
        <div className="card space-y-4">
          <h2 className="font-bold text-slate-800">المستودعات</h2>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                supabase.from('warehouses').insert({
                  name: whName.trim(),
                  location: whLoc.trim() || null,
                  is_active: true,
                }),
                'تمت إضافة المستودع'
              );
              setWhName('');
              setWhLoc('');
            }}
          >
            <input
              className="input"
              placeholder="اسم المستودع"
              value={whName}
              onChange={(e) => setWhName(e.target.value)}
              required
            />
            <input
              className="input"
              placeholder="الموقع"
              value={whLoc}
              onChange={(e) => setWhLoc(e.target.value)}
            />
            <button className="btn-primary w-full">إضافة</button>
          </form>
          {warehouses.length === 0 ? (
            <Empty />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {warehouses.map((w) => (
                <li key={w.id} className="flex justify-between py-2">
                  <span>{w.name}</span>
                  <span className="text-slate-400">{w.location || ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
