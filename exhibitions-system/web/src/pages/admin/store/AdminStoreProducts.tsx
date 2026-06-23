import { useEffect, useState } from 'react';
import { ShoppingBag, Save } from 'lucide-react';
import { adminStoreApi } from '../../../lib/api';
import type { SellableProduct } from '../../../lib/types';
import {
  Button,
  EmptyState,
  ErrorBanner,
  Input,
  PageHeader,
  Spinner,
  Table,
  useToast,
} from '../../../components/ui';
import { sar } from '../../../lib/format';

interface RowState {
  online_enabled: boolean;
  online_price: string;
  image_url: string;
  description: string;
}

export default function AdminStoreProducts() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [products, setProducts] = useState<SellableProduct[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const list = await adminStoreApi.listSellableProducts();
      setProducts(list);
      const map: Record<string, RowState> = {};
      for (const p of list) {
        map[p.id] = {
          online_enabled: !!p.online_enabled,
          online_price: p.online_price != null ? String(p.online_price) : '',
          image_url: p.image_url || '',
          description: p.description || '',
        };
      }
      setRows(map);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function update(id: string, patch: Partial<RowState>) {
    setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  }

  async function save(p: SellableProduct) {
    const row = rows[p.id];
    if (!row) return;
    setSavingId(p.id);
    try {
      await adminStoreApi.updateProduct(p.id, {
        online_enabled: row.online_enabled,
        online_price: row.online_price ? Number(row.online_price) : null,
        image_url: row.image_url.trim() || null,
        description: row.description.trim() || null,
      });
      toast.success('تم حفظ المنتج');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="منتجات المتجر"
        subtitle="اختر المنتجات المنشورة وحدّد سعرها وصورتها"
        icon={<ShoppingBag size={22} />}
      />
      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : products.length === 0 ? (
        <EmptyState message="لا توجد منتجات فعّالة" icon={<ShoppingBag size={26} />} />
      ) : (
        <Table
          head={
            <>
              <th>منشور</th>
              <th>المنتج</th>
              <th>السعر المرجعي</th>
              <th>سعر المتجر</th>
              <th>رابط الصورة</th>
              <th>الوصف</th>
              <th></th>
            </>
          }
        >
          {products.map((p) => {
            const row = rows[p.id];
            if (!row) return null;
            return (
              <tr key={p.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={row.online_enabled}
                    onChange={(e) =>
                      update(p.id, { online_enabled: e.target.checked })
                    }
                    className="h-5 w-5"
                  />
                </td>
                <td>
                  <div className="font-semibold">{p.name}</div>
                  <div className="font-mono text-xs text-muted">
                    {p.product_code}
                  </div>
                </td>
                <td className="text-muted">
                  {p.sale_price_ref != null ? sar(p.sale_price_ref) : '—'}
                </td>
                <td>
                  <Input
                    type="number"
                    step="0.01"
                    value={row.online_price}
                    onChange={(e) =>
                      update(p.id, { online_price: e.target.value })
                    }
                    placeholder={
                      p.sale_price_ref != null ? String(p.sale_price_ref) : '0'
                    }
                    className="w-28"
                  />
                </td>
                <td>
                  <Input
                    value={row.image_url}
                    onChange={(e) => update(p.id, { image_url: e.target.value })}
                    placeholder="https://..."
                    className="w-44"
                  />
                </td>
                <td>
                  <Input
                    value={row.description}
                    onChange={(e) =>
                      update(p.id, { description: e.target.value })
                    }
                    placeholder="وصف مختصر"
                    className="w-48"
                  />
                </td>
                <td>
                  <Button
                    size="sm"
                    icon={<Save size={13} />}
                    loading={savingId === p.id}
                    onClick={() => save(p)}
                  >
                    حفظ
                  </Button>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
