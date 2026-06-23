import { useEffect, useState } from 'react';
import { Undo2 } from 'lucide-react';
import { employeeApi } from '../../lib/api';
import { useEmployeeAuth } from '../../context/EmployeeAuthContext';
import type { EmployeeRecentSale } from '../../lib/types';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  StatusBadge,
  useToast,
} from '../../components/ui';
import { fmtDateTime, sar } from '../../lib/format';

export default function EmployeeReturns() {
  const { session } = useEmployeeAuth();
  const toast = useToast();
  const [sales, setSales] = useState<EmployeeRecentSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [refundMethod, setRefundMethod] = useState('cash');
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      setSales((await employeeApi.recentSales(session.token)) || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const selected = sales.find((s) => s.sale_id === selectedId) || null;

  function selectSale(id: string) {
    setSelectedId(id);
    setQtys({});
  }

  async function submit() {
    if (!session || !selected) return;
    const items = selected.items
      .map((it) => ({
        sale_item_id: it.sale_item_id,
        qty: Number(qtys[it.sale_item_id]) || 0,
      }))
      .filter((it) => it.qty > 0);
    if (items.length === 0)
      return toast.error('حدد كمية الإرجاع لمنتج واحد على الأقل');
    setSubmitting(true);
    try {
      await employeeApi.createSaleReturn(
        session.token,
        selected.sale_id,
        items,
        refundMethod
      );
      toast.success('تم تسجيل الإرجاع');
      setSelectedId('');
      setQtys({});
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="إرجاع المبيعات"
        subtitle="اختر فاتورة ثم حدد المنتجات وكميات الإرجاع"
        icon={<Undo2 size={22} />}
      />
      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : sales.length === 0 ? (
        <EmptyState message="لا توجد مبيعات حديثة" />
      ) : (
        <div className="space-y-6">
          <Card>
            <Field label="الفاتورة">
              <Select
                value={selectedId}
                onChange={(e) => selectSale(e.target.value)}
              >
                <option value="">— اختر فاتورة —</option>
                {sales.map((s) => (
                  <option key={s.sale_id} value={s.sale_id}>
                    {fmtDateTime(s.created_at)} — {sar(s.total)}
                  </option>
                ))}
              </Select>
            </Field>
          </Card>

          {selected && (
            <Card>
              <CardHeader
                title="منتجات الفاتورة"
                action={<StatusBadge status={selected.status} />}
              />
              {selected.items.length === 0 ? (
                <EmptyState message="لا توجد منتجات" />
              ) : (
                <div className="space-y-3">
                  {selected.items.map((it) => (
                    <div
                      key={it.sale_item_id}
                      className="flex flex-wrap items-end justify-between gap-3 rounded-lg bg-bg-2 p-3"
                    >
                      <div>
                        <p className="font-semibold text-text">{it.name}</p>
                        <p className="text-xs text-muted">
                          الكمية المباعة: {it.qty} · {sar(it.unit_price)}
                        </p>
                      </div>
                      <Field label="كمية الإرجاع" className="w-32">
                        <Input
                          type="number"
                          min={0}
                          max={it.qty}
                          value={qtys[it.sale_item_id] ?? ''}
                          onChange={(e) =>
                            setQtys((s) => ({
                              ...s,
                              [it.sale_item_id]: e.target.value,
                            }))
                          }
                        />
                      </Field>
                    </div>
                  ))}

                  <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
                    <Field label="طريقة الاسترداد" className="w-44">
                      <Select
                        value={refundMethod}
                        onChange={(e) => setRefundMethod(e.target.value)}
                      >
                        <option value="cash">نقدًا</option>
                        <option value="card">شبكة</option>
                      </Select>
                    </Field>
                    <Button onClick={submit} loading={submitting}>
                      تسجيل الإرجاع
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
