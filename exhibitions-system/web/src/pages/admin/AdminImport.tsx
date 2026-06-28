import { useEffect, useMemo, useState } from 'react';
import { Upload, FileSpreadsheet, Download, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
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

type EntityKey = 'products' | 'customers' | 'suppliers' | 'categories';

interface FieldDef {
  key: string;
  label: string;
  aliases: string[];
  required?: boolean;
}

interface EntityConfig {
  key: EntityKey;
  label: string;
  needsWarehouse?: boolean;
  fields: FieldDef[];
  template: string;
  run: (warehouseId: string, rows: ImportRow[]) => Promise<ImportResult>;
}

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

const ENTITIES: EntityConfig[] = [
  {
    key: 'products',
    label: 'المنتجات والمخزون',
    needsWarehouse: true,
    fields: [
      { key: 'code', label: 'الكود', required: true, aliases: ['الكود', 'كود', 'كودالمنتج', 'كودالمادة', 'رقمالمادة', 'باركود', 'الباركود', 'code', 'sku', 'barcode'] },
      { key: 'name', label: 'الاسم', required: true, aliases: ['الاسم', 'اسم', 'اسمالمادة', 'المادة', 'الصنف', 'البيان', 'name', 'item'] },
      { key: 'base_unit', label: 'الوحدة', aliases: ['الوحدة', 'وحدة', 'وحدةالقياس', 'unit', 'uom'] },
      { key: 'cost', label: 'التكلفة', aliases: ['التكلفة', 'تكلفة', 'سعرالتكلفة', 'الكلفة', 'cost'] },
      { key: 'price', label: 'السعر', aliases: ['السعر', 'سعرالبيع', 'السعرالمرجعي', 'price'] },
      { key: 'qty', label: 'الكمية', aliases: ['الكمية', 'كمية', 'الرصيد', 'رصيد', 'qty', 'quantity', 'stock'] },
      { key: 'reorder', label: 'نقطة الطلب', aliases: ['نقطةالطلب', 'حدالطلب', 'reorder', 'min'] },
      { key: 'expiry', label: 'الصلاحية', aliases: ['الصلاحية', 'تاريخالصلاحية', 'expiry', 'exp'] },
      { key: 'batch_no', label: 'رقم الدفعة', aliases: ['الدفعة', 'رقمالدفعة', 'batch', 'lot'] },
      { key: 'supplier', label: 'المورد', aliases: ['المورد', 'مورد', 'supplier', 'vendor'] },
    ],
    template:
      'الكود,الاسم,الوحدة,التكلفة,السعر,الكمية,نقطة الطلب,الصلاحية,رقم الدفعة,المورد\n' +
      'A-001,أرز بسمتي,كيس,8,12,200,40,,,مورد المواد الغذائية\n' +
      'A-002,زيت دوار الشمس,عبوة,18,25,120,30,2027-01-01,L-2026,مورد المواد الغذائية\n',
    run: (wh, rows) => adminApi.importProducts(wh, rows),
  },
  {
    key: 'customers',
    label: 'العملاء (وأرصدتهم)',
    fields: [
      { key: 'name', label: 'الاسم', required: true, aliases: ['الاسم', 'اسم', 'اسمالعميل', 'العميل', 'الزبون', 'name', 'customer'] },
      { key: 'phone', label: 'الهاتف', aliases: ['الهاتف', 'هاتف', 'الجوال', 'جوال', 'رقم', 'phone', 'mobile'] },
      { key: 'credit_limit', label: 'حد الائتمان', aliases: ['حدالائتمان', 'سقفالدين', 'حدالدين', 'creditlimit', 'limit'] },
      { key: 'opening_balance', label: 'الرصيد الافتتاحي (دين)', aliases: ['الرصيد', 'رصيد', 'الرصيدالافتتاحي', 'الدين', 'دين', 'عليه', 'balance', 'opening', 'debt'] },
      { key: 'note', label: 'ملاحظات', aliases: ['ملاحظات', 'ملاحظة', 'note', 'notes'] },
    ],
    template:
      'الاسم,الهاتف,حد الائتمان,الرصيد الافتتاحي,ملاحظات\n' +
      'بقالة الحي,0944111111,5000,750,عميل جملة\n' +
      'مطعم الشام,0944222222,3000,0,\n',
    run: (_wh, rows) => adminApi.importCustomers(rows),
  },
  {
    key: 'suppliers',
    label: 'الموردون',
    fields: [
      { key: 'name', label: 'الاسم', required: true, aliases: ['الاسم', 'اسم', 'اسمالمورد', 'المورد', 'name', 'supplier', 'vendor'] },
      { key: 'phone', label: 'الهاتف', aliases: ['الهاتف', 'هاتف', 'الجوال', 'جوال', 'phone', 'mobile'] },
      { key: 'note', label: 'ملاحظات', aliases: ['ملاحظات', 'ملاحظة', 'note', 'notes'] },
    ],
    template: 'الاسم,الهاتف,ملاحظات\nمورد المواد الغذائية,0911000000,\n',
    run: (_wh, rows) => adminApi.importSuppliers(rows),
  },
  {
    key: 'categories',
    label: 'الفئات',
    fields: [
      { key: 'name', label: 'الاسم', required: true, aliases: ['الاسم', 'اسم', 'الفئة', 'فئة', 'التصنيف', 'name', 'category'] },
    ],
    template: 'الاسم\nمواد غذائية\nمشروبات\n',
    run: (_wh, rows) => adminApi.importCategories(rows),
  },
];

function normalizeDate(v: string): string {
  const s = v.trim();
  if (!s) return '';
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
}

function splitRows(text: string): string[][] {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  const delim = lines[0]?.includes('\t') ? '\t' : ',';
  return lines.map((l) => l.split(delim).map((c) => c.trim()));
}

interface AiMapping {
  mapping: Record<string, string | null>;
  has_header: boolean;
}

function parse(text: string, cfg: EntityConfig, ai?: AiMapping | null): ImportRow[] {
  const grid = splitRows(text);
  if (grid.length === 0) return [];
  let mapping: (string | null)[];
  let dataRows: string[][];

  if (ai && ai.mapping) {
    // مطابقة الذكاء الاصطناعي (حسب رقم العمود)
    const width = Math.max(...grid.map((g) => g.length));
    mapping = Array.from({ length: width }, (_, i) => {
      const v = ai.mapping[String(i)];
      return v && cfg.fields.some((f) => f.key === v) ? v : null;
    });
    dataRows = ai.has_header ? grid.slice(1) : grid;
  } else {
    const aliasToKey: Record<string, string> = {};
    cfg.fields.forEach((f) => f.aliases.forEach((a) => (aliasToKey[norm(a)] = f.key)));
    const header = grid[0].map(norm);
    const recognized = header.filter((h) => aliasToKey[h]).length;
    const requiredCount = cfg.fields.filter((f) => f.required).length;
    if (recognized >= Math.min(requiredCount, 1) && recognized > 0) {
      mapping = header.map((h) => aliasToKey[h] ?? null);
      dataRows = grid.slice(1);
    } else {
      mapping = cfg.fields.slice(0, grid[0].length).map((f) => f.key);
      dataRows = grid;
    }
  }
  const out: ImportRow[] = [];
  for (const cells of dataRows) {
    const row: ImportRow = {};
    mapping.forEach((key, i) => {
      if (!key) return;
      const val = (cells[i] ?? '').trim();
      if (val) row[key] = key === 'expiry' ? normalizeDate(val) : val;
    });
    if (cfg.fields.filter((f) => f.required).every((f) => row[f.key])) out.push(row);
  }
  return out;
}

export default function AdminImport() {
  const [entityKey, setEntityKey] = useState<EntityKey>('products');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [ai, setAi] = useState<AiMapping | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [aiSummary, setAiSummary] = useState('');
  const toast = useToast();

  const cfg = ENTITIES.find((e) => e.key === entityKey)!;

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

  const rows = useMemo(() => parse(text, cfg, ai), [text, cfg, ai]);

  function switchEntity(k: EntityKey) {
    setEntityKey(k);
    setText('');
    setResult(null);
    setAi(null);
    setAiWarnings([]);
    setAiSummary('');
  }

  async function analyze() {
    if (!text.trim()) return toast.error('الصق البيانات أولًا');
    setAiBusy(true);
    try {
      const sample = text.split('\n').slice(0, 25).join('\n');
      const { data, error } = await supabase.functions.invoke('import-analyze', {
        body: { sample, entity: cfg.key, fields: cfg.fields.map((f) => ({ key: f.key, label: f.label })) },
      });
      if (error) throw error;
      if (!data?.ok) {
        if (data?.error === 'no_key')
          toast.error('الذكاء الاصطناعي غير مفعّل بعد (يلزم ضبط مفتاح). استُخدمت المطابقة التلقائية.');
        else toast.error('تعذّر التحليل الذكي — استُخدمت المطابقة التلقائية.');
        return;
      }
      setAi({ mapping: data.mapping || {}, has_header: !!data.has_header });
      setAiWarnings(Array.isArray(data.warnings) ? data.warnings : []);
      setAiSummary(data.summary || '');
      toast.success('حلّل الذكاء الاصطناعي الأعمدة');
    } catch (e) {
      toast.error((e as Error).message || 'فشل الاتصال بالمحلّل');
    } finally {
      setAiBusy(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ''));
    reader.readAsText(f, 'utf-8');
  }

  function downloadTemplate() {
    const blob = new Blob(['﻿' + cfg.template], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `قالب-${cfg.label}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function doImport() {
    if (cfg.needsWarehouse && !warehouseId) return toast.error('اختر المستودع');
    if (rows.length === 0) return toast.error('لا توجد صفوف صالحة (تأكد من الأعمدة المطلوبة)');
    setBusy(true);
    setResult(null);
    try {
      const res = await cfg.run(warehouseId, rows);
      setResult(res);
      toast.success(`تم: ${res.created} جديد، ${res.updated} محدّث`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;

  const previewCols = cfg.fields.slice(0, 6);

  return (
    <div>
      <PageHeader
        title="استيراد البيانات (ترحيل)"
        subtitle="رحّل نظامك كاملًا من البيان/الأمين أو أي ملف Excel/CSV"
        icon={<Upload size={22} />}
        action={
          <Button variant="outline" icon={<Download size={16} />} onClick={downloadTemplate}>
            تنزيل القالب
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {ENTITIES.map((e) => (
          <Button
            key={e.key}
            variant={entityKey === e.key ? 'primary' : 'outline'}
            size="sm"
            onClick={() => switchEntity(e.key)}
          >
            {e.label}
          </Button>
        ))}
      </div>

      <Card className="mb-5 space-y-4">
        <div className="rounded-lg border border-info/30 bg-info/5 p-3 text-sm text-muted">
          <p className="mb-1 font-bold text-info">طريقتان:</p>
          <p>١) صدّر «{cfg.label}» من برنامجك إلى Excel ← انسخ الأعمدة والصقها بالأسفل.</p>
          <p>
            ٢) أو احفظ بصيغة CSV وارفعه. الأعمدة المدعومة:{' '}
            {cfg.fields.map((f) => f.label + (f.required ? '*' : '')).join('، ')}.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {cfg.needsWarehouse && (
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
          )}
          <Field label="رفع ملف CSV">
            <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} className="ax-input" />
          </Field>
        </div>

        <Field label="أو الصق البيانات هنا (من Excel مباشرة)">
          <textarea
            className="ax-input min-h-[160px] font-mono text-xs"
            placeholder={cfg.fields.map((f) => f.label).join('\t')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            dir="ltr"
          />
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <span className="text-sm text-muted">
            صفوف صالحة: <span className="font-bold text-text">{rows.length}</span>
            {ai && <span className="mr-2 text-info"> · مُطابَق بالذكاء الاصطناعي</span>}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              icon={<Sparkles size={16} />}
              loading={aiBusy}
              disabled={!text.trim()}
              onClick={analyze}
            >
              تحليل ذكي (AI)
            </Button>
            <Button
              icon={<FileSpreadsheet size={16} />}
              loading={busy}
              disabled={rows.length === 0}
              onClick={doImport}
            >
              استيراد {rows.length > 0 ? `(${rows.length})` : ''}
            </Button>
          </div>
        </div>
      </Card>

      {(aiSummary || aiWarnings.length > 0) && (
        <Card className="mb-5 border-info/30 bg-info/5">
          <div className="mb-2 flex items-center gap-2 text-info">
            <Sparkles size={18} />
            <span className="font-bold">تحليل الذكاء الاصطناعي</span>
          </div>
          {aiSummary && <p className="mb-2 text-sm text-text">{aiSummary}</p>}
          {aiWarnings.length > 0 && (
            <ul className="space-y-1 text-sm text-muted">
              {aiWarnings.map((w, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
                  {w}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {rows.length > 0 && !result && (
        <Card className="mb-5">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">معاينة (أول 10 صفوف)</p>
          <div className="overflow-x-auto">
            <table className="ax-table">
              <thead>
                <tr>
                  {previewCols.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i}>
                    {previewCols.map((c) => (
                      <td key={c.key} className={c.key === 'name' ? 'font-semibold' : 'text-muted'}>
                        {r[c.key] || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 10 && <p className="mt-2 text-xs text-muted">… و {rows.length - 10} صفًا آخر</p>}
        </Card>
      )}

      {result && (
        <Card>
          <div className="mb-3 flex items-center gap-2 text-success">
            <CheckCircle2 size={20} />
            <span className="font-bold">اكتمل الاستيراد</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            <Stat label="جديد" value={result.created} tone="text-success" />
            <Stat label="محدّث" value={result.updated} tone="text-info" />
            {result.stock_set != null && <Stat label="أرصدة مضبوطة" value={result.stock_set} tone="text-gold" />}
            {result.with_opening_balance != null && (
              <Stat label="رصيد افتتاحي" value={result.with_opening_balance} tone="text-gold" />
            )}
            {result.skipped != null && <Stat label="مُتجاوَز" value={result.skipped} tone="text-muted" />}
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
                    {er.row ? `صف ${er.row}` : ''}
                    {er.code || er.name ? ` (${er.code || er.name})` : ''}: {er.message}
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
