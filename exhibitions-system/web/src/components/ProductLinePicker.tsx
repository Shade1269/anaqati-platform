import { useMemo, useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { sar } from '../lib/format';
import { Input } from './ui';

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
  /** وحدة القياس المختارة؛ null = الوحدة الأساس */
  uom_id?: string | null;
  /** رقم الدفعة وتاريخ الصلاحية (عند الاستلام للمنتجات المتتبَّعة) */
  batch_no?: string;
  expiry?: string;
}

/** خيار وحدة قياس لمنتج معيّن (الأساس يُمثَّل بـ id=null) */
export interface UnitOption {
  id: string | null;
  label: string;
  factor: number;
}

interface Props {
  products: LineProduct[];
  lines: Line[];
  onChange: (lines: Line[]) => void;
  /** show a per-line editable price column */
  withPrice?: boolean;
  /** show a per-line unit-of-measure selector */
  withUom?: boolean;
  /** unit options keyed by product id (loaded lazily by the parent) */
  unitsByProduct?: Record<string, UnitOption[]>;
  /** show per-line batch number + expiry date (receiving perishables) */
  withBatch?: boolean;
}

export default function ProductLinePicker({
  products,
  lines,
  onChange,
  withPrice = false,
  withUom = false,
  unitsByProduct = {},
  withBatch = false,
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
    onChange([...lines, { product_id: id, qty: 1, unit_price: p?.price_ref ?? 0 }]);
  }

  function update(id: string, patch: Partial<Line>) {
    onChange(lines.map((l) => (l.product_id === id ? { ...l, ...patch } : l)));
  }

  function remove(id: string) {
    onChange(lines.filter((l) => l.product_id !== id));
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            className="pr-9"
            placeholder="ابحث عن منتج بالاسم أو الكود..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-white/10 bg-bg-2">
          {filtered.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-muted">
              لا توجد منتجات مطابقة
            </p>
          )}
          {filtered.map((p) => {
            const added = lines.some((l) => l.product_id === p.id);
            return (
              <button
                key={p.id}
                type="button"
                disabled={added}
                onClick={() => addProduct(p.id)}
                className="flex w-full items-center justify-between gap-2 border-b border-white/5 px-3 py-2.5 text-right text-sm transition last:border-0 hover:bg-primary/8 disabled:opacity-40"
              >
                <span className="flex items-center gap-2">
                  <Plus size={14} className="text-primary-hover" />
                  <span className="font-medium text-text">{p.name}</span>
                  <span className="text-muted">({p.code})</span>
                </span>
                <span className="text-muted">
                  {p.price_ref != null ? sar(p.price_ref) : '—'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {lines.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="ax-table">
            <thead>
              <tr>
                <th>المنتج</th>
                {withUom && <th>الوحدة</th>}
                <th>الكمية</th>
                {withBatch && <th>رقم الدفعة</th>}
                {withBatch && <th>الصلاحية</th>}
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
                      <span className="text-muted">({p?.code})</span>
                    </td>
                    {withUom && (
                      <td>
                        <select
                          className="ax-input w-28"
                          value={l.uom_id ?? ''}
                          onChange={(e) =>
                            update(l.product_id, {
                              uom_id: e.target.value || null,
                            })
                          }
                        >
                          {(unitsByProduct[l.product_id] ?? []).map((u) => (
                            <option key={u.id ?? 'base'} value={u.id ?? ''}>
                              {u.label}
                              {u.factor !== 1 ? ` (×${u.factor})` : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td>
                      <input
                        type="number"
                        min={withUom ? 0 : 1}
                        step={withUom ? 'any' : 1}
                        className="ax-input w-20"
                        value={l.qty}
                        onChange={(e) => {
                          const n = Number(e.target.value) || 0;
                          update(l.product_id, {
                            qty: withUom ? Math.max(0, n) : Math.max(1, n),
                          });
                        }}
                      />
                    </td>
                    {withBatch && (
                      <td>
                        <input
                          type="text"
                          className="ax-input w-28"
                          placeholder="—"
                          value={l.batch_no ?? ''}
                          onChange={(e) =>
                            update(l.product_id, { batch_no: e.target.value })
                          }
                        />
                      </td>
                    )}
                    {withBatch && (
                      <td>
                        <input
                          type="date"
                          className="ax-input w-36"
                          value={l.expiry ?? ''}
                          onChange={(e) =>
                            update(l.product_id, { expiry: e.target.value })
                          }
                        />
                      </td>
                    )}
                    {withPrice && (
                      <td>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="ax-input w-28"
                          value={l.unit_price ?? 0}
                          onChange={(e) =>
                            update(l.product_id, {
                              unit_price: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                        />
                      </td>
                    )}
                    {withPrice && (
                      <td className="font-semibold text-gold">{sar(lineTotal)}</td>
                    )}
                    <td>
                      <button
                        type="button"
                        onClick={() => remove(l.product_id)}
                        className="rounded-lg p-1.5 text-danger transition hover:bg-danger/10"
                      >
                        <Trash2 size={16} />
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
