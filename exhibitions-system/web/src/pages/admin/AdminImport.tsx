import { useEffect, useMemo, useState } from 'react';
import { Upload, FileSpreadsheet, Download, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/api';
import type { ImportResult, ImportRow, Warehouse } from '../../lib/types';
import {
  Button,
  Card,
  Field,
  PageHeader,
  Select,
  Spinner,
  useToast,
} from '../../components/ui';

// خريطة المرادفات: ترويسة الملف → الحقل (عربي/إنجليزي من البيان/الأمين)
const HEADER_MAP: Record<string, keyof ImportRow> = {};
function reg(field: keyof ImportRow, names: string[]) {
  names.forEach((n) => (HEADER_MAP[n.replace(/\s+/g, '').toLowerCase()] = field));
}
reg('code', ['الكود', 'كود', 'كودالمنتج', 'كودالمادة', 'رقمالمادة', 'باركود', 'الباركود', 'code', 'sku', 'barcode']);
reg('name', ['الاسم', 'اسم', 'اسمالمادة', 'المادة', 'الصنف', 'البيان', 'name', 'item', 'description']);
reg('base_unit', ['الوحدة', 'وحدة', 'وحدةالقياس', 'unit', 'uom']);
reg('cost', ['التكلفة', 'تكلفة', 'سعرالتكلفة', 'الكلفة', 'cost', 'costprice']);
reg('price', ['السعر', 'سعرالبيع', 'السعرالمرجعي', 'سعرالمفرد', 'price', 'saleprice']);
reg('qty', ['الكمية', 'كمية', 'الرصيد', 'رصيد', 'الرصيدالحالي', 'qty', 'quantity', 'stock', 'balance']);
reg('reorder', ['نقطةالطلب', 'حدالطلب', 'حدأدنى', 'reorder', 'reorderlevel', 'min']);
reg('expiry', ['الصلاحية', 'تاريخالصلاحية', 'انتهاء', 'expiry', 'expirydate', 'exp']);
reg('batch_no', ['الدفعة', 'رقمالدفعة', 'batch', 'batchno', 'lot']);
reg('supplier', ['المورد', 'مورد', 'اسمالمورد', 'supplier', 'vendor']);

// الترتيب الافتراضي إذا تعذّر التعرّف على الترويسة
const DEFAULT_ORDER: (keyof ImportRow)[] = [
  'code', 'name', 'base_unit', 'cost', 'price', 'qty', 'reorder', 'expiry', 'batch_no', 'supplier',
];

function normalizeDate(v: string): string {
  const s = v.trim();
  if (!s) return '';
  // yyyy-mm-dd كما هو
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) return s;
  // dd/mm/yyyy أو dd-mm-yyyy → yyyy-mm-dd
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
}

function splitRows(text: string): string[][] {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  const delim = lines[0]?.includes('\t') ? '\t' : ',';
  return lines.map((l) => l.split(delim).map((c) => c.trim()));
}

function parse(text: string): ImportRow[] {
  const grid = splitRows(text);
  if (grid.length === 0) return [];
  // هل الصف الأول ترويسة معروفة؟
  const header = grid[0].map((h) => h.replace(/\s+/g, '').toLowerCase());
  const recognized = header.filter((h) => HEADER_MAP[h]).length;
  let mapping: (keyof ImportRow | null)[];
  let dataRows: string[][];
  if (recognized >= 2) {
    mapping = header.map((h) => HEADER_MAP[h] ?? null);
    dataRows = grid.slice(1);
  } else {
    mapping = DEFAULT_ORDER.slice(0, grid[0].length);
    dataRows = grid;
  }
  const out: ImportRow[] = [];
  for (const cells of dataRows) {
    const row: Partial<ImportRow> = {};
    mapping.forEach((field, i) => {
      if (!field) return;
      const val = (cells[i] ?? '').trim();
      if (val) row[field] = field === 'expiry' ? normalizeDate(val) : val;
    });
    if (row.code && row.name) out.push(row as ImportRow);
  }
  return out;
}

const TEMPLATE =
  'الكود,الاسم,الوحدة,التكلفة,السعر,الكمية,نقطة الطلب,الصلاحية,رقم الدفعة,المورد\n' +
  'A-001,أرز بسمتي,كيس,8,12,200,40,,,مورد المواد الغذائية\n' +
  'A-002,زيت دوار الشمس,عبوة,18,25,120,30,2027-01-01,L-2026,مورد المواد الغذائية\n';

export default function AdminImport() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const toast = useToast();

  useEffect(() => {
    supabase
      .from('warehouses')
      .select('id,name,location,is_active')
      .order('name')
      .then(({ data }) => {
        const ws = (data as Warehouse[]) || [];
        setWarehouses(ws);
        if (ws.length === 1) setWarehouseId(ws[0].id);
        setLoading(false);
      });
  }, []);

  const rows = useMemo(() => parse(text), [text]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ''));
    reader.readAsText(f, 'utf-8');
  }

  function downloadTemplate() {
    const blob = new Blob(['﻿' + TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'قالب-استيراد-المنتجات.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function doImport() {
    if (!warehouseId) return toast.error('اختر المستودع');
    if (rows.length === 0) return toast.error('لا توجد صفوف صالحة (تأكد من الكود والاسم)');
    setBusy(true);
    setResult(null);
    try {
      const res = await adminApi.importProducts(warehouseId, rows);
      setResult(res);
      toast.success(`تم: ${res.created} جديد، ${res.updated} محدّث`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="استيراد البيانات"
        subtitle="رحّل أصنافك وأرصدتك من البيان/الأمين أو أي ملف Excel/CSV"
        icon={<Upload size={22} />}
        action={
          <Button variant="outline" icon={<Download size={16} />} onClick={downloadTemplate}>
            تنزيل القالب
          </Button>
        }
      />

      <Card className="mb-5 space-y-4">
        <div className="rounded-lg border border-info/30 bg-info/5 p-3 text-sm text-muted">
          <p className="mb-1 font-bold text-info">طريقتان سهلتان:</p>
          <p>
            ١) من برنامجك (البيان/الأمين) صدّر الأصناف إلى Excel ← حدّد الأعمدة وانسخها ← الصقها
            في الصندوق بالأسفل.
          </p>
          <p>٢) أو احفظ الملف بصيغة CSV وارفعه. الأعمدة المدعومة: الكود، الاسم، الوحدة، التكلفة،
            السعر، الكمية، نقطة الطلب، الصلاحية، رقم الدفعة، المورد.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="المستودع (لرصيد الافتتاح)">
            <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">—</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="رفع ملف CSV">
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={onFile}
              className="ax-input"
            />
          </Field>
        </div>

        <Field label="أو الصق البيانات هنا (من Excel مباشرة)">
          <textarea
            className="ax-input min-h-[160px] font-mono text-xs"
            placeholder={'الكود\tالاسم\tالوحدة\tالكمية\n...'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            dir="ltr"
          />
        </Field>

        <div className="flex items-center justify-between border-t border-white/10 pt-4">
          <span className="text-sm text-muted">
            صفوف صالحة للاستيراد: <span className="font-bold text-text">{rows.length}</span>
          </span>
          <Button
            icon={<FileSpreadsheet size={16} />}
            loading={busy}
            disabled={rows.length === 0}
            onClick={doImport}
          >
            استيراد {rows.length > 0 ? `(${rows.length})` : ''}
          </Button>
        </div>
      </Card>

      {rows.length > 0 && !result && (
        <Card className="mb-5">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
            معاينة (أول 10 صفوف)
          </p>
          <div className="overflow-x-auto">
            <table className="ax-table">
              <thead>
                <tr>
                  <th>الكود</th>
                  <th>الاسم</th>
                  <th>الوحدة</th>
                  <th>التكلفة</th>
                  <th>السعر</th>
                  <th>الكمية</th>
                  <th>الصلاحية</th>
                  <th>المورد</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i}>
                    <td className="font-mono text-muted">{r.code}</td>
                    <td className="font-semibold">{r.name}</td>
                    <td className="text-muted">{r.base_unit || '—'}</td>
                    <td>{r.cost || '—'}</td>
                    <td>{r.price || '—'}</td>
                    <td className="text-gold">{r.qty || '—'}</td>
                    <td className="text-muted">{r.expiry || '—'}</td>
                    <td className="text-muted">{r.supplier || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 10 && (
            <p className="mt-2 text-xs text-muted">… و {rows.length - 10} صفًا آخر</p>
          )}
        </Card>
      )}

      {result && (
        <Card>
          <div className="mb-3 flex items-center gap-2 text-success">
            <CheckCircle2 size={20} />
            <span className="font-bold">اكتمل الاستيراد</span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="منتجات جديدة" value={result.created} tone="text-success" />
            <Stat label="منتجات محدّثة" value={result.updated} tone="text-info" />
            <Stat label="أرصدة مضبوطة" value={result.stock_set} tone="text-gold" />
          </div>
          {result.errors.length > 0 && (
            <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-3">
              <div className="mb-2 flex items-center gap-2 text-warning">
                <AlertTriangle size={16} />
                <span className="font-bold">صفوف تجاوزها النظام ({result.errors.length})</span>
              </div>
              <ul className="space-y-1 text-sm text-muted">
                {result.errors.slice(0, 20).map((er, i) => (
                  <li key={i}>
                    صف {er.row}
                    {er.code ? ` (${er.code})` : ''}: {er.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}
