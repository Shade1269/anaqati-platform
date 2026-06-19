import { useMemo, useState } from 'react';
import { sar } from '../lib/format';

export interface LineProduct {
  id: string;
  code: string;
  name: string;
  price_ref?: number | null;
}

export interface Line {
  product_id: string;
  qty: number;
  unit_price?: number;
}

interface Props {
  products: LineProduct[];
  lines: Line[];
  onChange: (lines: Line[]) => void;
  /** show a per-line editable price column */
  withPrice?: boolean;
}

export default function ProductLinePicker({
  products,
  lines,
  onChange,
  withPrice = false,
}: Props) {
  const [search, setSearch] = useState('');
  const byId = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
    );
  }, [products, search]);

  function addProduct(id: string) {
    if (lines.some((l) => l.product_id === id)) return;
    const p = byId[id];
    onChange([
      ...lines,
      { product_id: id, qty: 1, unit_price: p?.price_ref ?? 0 },
    ]);
  }

  function update(id: string, patch: Partial<Line>) {
    onChange(
      lines.map((l) => (l.product_id === id ? { ...l, ...patch } : l))
    );
  }

  function remove(id: string) {
    onChange(lines.filter((l) => l.product_id !== id));
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="label">اختر منتجًا للإضافة</label>
        <input
          className="input"
          placeholder="ابحث بالاسم أو الكود..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="mt-2 max-h-44 overflow-auto rounded-lg border border-slate-200">
          {filtered.length === 0 && (
            <p className="px-3 py-3 text-sm text-slate-400">لا توجد منتجات</p>
          )}
          {filtered.map((p) => {
            const added = lines.some((l) => l.product_id === p.id);
            return (
              <button
                key={p.id}
                type="button"
                disabled={added}
                onClick={() => addProduct(p.id)}
                className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-right text-sm last:border-0 hover:bg-indigo-50 disabled:opacity-40"
              >
                <span>
                  <span className="font-medium">{p.name}</span>{' '}
                  <span className="text-slate-400">({p.code})</span>
                </span>
                <span className="text-slate-500">
                  {p.price_ref != null ? sar(p.price_ref) : '—'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {lines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>المنتج</th>
                <th>الكمية</th>
                {withPrice && <th>سعر الوحدة</th>}
                {withPrice && <th>الإجمالي</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const p = byId[l.product_id];
                const lineTotal = (l.unit_price ?? 0) * l.qty;
                return (
                  <tr key={l.product_id}>
                    <td>
                      {p?.name}{' '}
                      <span className="text-slate-400">({p?.code})</span>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        className="input w-24"
                        value={l.qty}
                        onChange={(e) =>
                          update(l.product_id, {
                            qty: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                      />
                    </td>
                    {withPrice && (
                      <td>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="input w-28"
                          value={l.unit_price ?? 0}
                          onChange={(e) =>
                            update(l.product_id, {
                              unit_price: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                        />
                      </td>
                    )}
                    {withPrice && <td>{sar(lineTotal)}</td>}
                    <td>
                      <button
                        type="button"
                        onClick={() => remove(l.product_id)}
                        className="text-rose-600 hover:underline"
                      >
                        حذف
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
