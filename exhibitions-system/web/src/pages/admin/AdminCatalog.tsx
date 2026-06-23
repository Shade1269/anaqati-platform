import { useEffect, useState } from 'react';
import { Tags, Truck, Warehouse as WhIcon, Layers } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Category, Supplier, Warehouse } from '../../lib/types';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  PageHeader,
  Spinner,
  useToast,
} from '../../components/ui';

export default function AdminCatalog() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

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
      supabase.from('warehouses').select('id,name,location,is_active').order('name'),
    ]);
    if (c.error) toast.error(c.error.message);
    setCategories((c.data as Category[]) || []);
    setSuppliers((s.data as Supplier[]) || []);
    setWarehouses((w.data as Warehouse[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(
    promise: PromiseLike<{ error: { message: string } | null }>,
    msg: string
  ) {
    const { error } = await promise;
    if (error) toast.error(error.message);
    else {
      toast.success(msg);
      load();
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="الكتالوج"
        subtitle="الفئات والموردون والمستودعات"
        icon={<Tags size={22} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="الفئات" icon={<Layers size={18} />} />
          <form
            className="mb-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                supabase.from('categories').insert({ name: catName.trim() }),
                'تمت إضافة الفئة'
              );
              setCatName('');
            }}
          >
            <Input
              placeholder="اسم الفئة"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              required
            />
            <Button type="submit">إضافة</Button>
          </form>
          {categories.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="divide-y divide-white/5 text-sm">
              {categories.map((c) => (
                <li key={c.id} className="py-2.5 text-text">
                  {c.name}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="الموردون" icon={<Truck size={18} />} />
          <form
            className="mb-4 space-y-2"
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
            <Input
              placeholder="اسم المورد"
              value={supName}
              onChange={(e) => setSupName(e.target.value)}
              required
            />
            <Input
              placeholder="الجوال"
              value={supPhone}
              onChange={(e) => setSupPhone(e.target.value)}
            />
            <Button type="submit" className="w-full">
              إضافة
            </Button>
          </form>
          {suppliers.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="divide-y divide-white/5 text-sm">
              {suppliers.map((s) => (
                <li key={s.id} className="flex justify-between py-2.5">
                  <span className="text-text">{s.name}</span>
                  <span className="text-muted">{s.phone || ''}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="المستودعات" icon={<WhIcon size={18} />} />
          <form
            className="mb-4 space-y-2"
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
            <Input
              placeholder="اسم المستودع"
              value={whName}
              onChange={(e) => setWhName(e.target.value)}
              required
            />
            <Input
              placeholder="الموقع"
              value={whLoc}
              onChange={(e) => setWhLoc(e.target.value)}
            />
            <Button type="submit" className="w-full">
              إضافة
            </Button>
          </form>
          {warehouses.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="divide-y divide-white/5 text-sm">
              {warehouses.map((w) => (
                <li key={w.id} className="flex justify-between py-2.5">
                  <span className="text-text">{w.name}</span>
                  <span className="text-muted">{w.location || ''}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
