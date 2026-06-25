import { useState } from 'react';
import { Scissors, Plus, Trash2 } from 'lucide-react';
import { Button, Card, CardHeader, Field, Input, PageHeader, Table } from '../../components/ui';

interface Part { name: string; len: string; wid: string; qty: string }
const emptyPart: Part = { name: '', len: '', wid: '', qty: '1' };

/** حاسبة قص الألواح (خشب) — تقدير بالمساحة (دون تعشيش دقيق). */
export default function CutListCalc() {
  const [sheetL, setSheetL] = useState('2440');
  const [sheetW, setSheetW] = useState('1220');
  const [kerf, setKerf] = useState('3');
  const [parts, setParts] = useState<Part[]>([{ ...emptyPart }]);

  const sheetArea = (Number(sheetL) || 0) * (Number(sheetW) || 0);
  const k = Number(kerf) || 0;
  let partsArea = 0;
  let totalPieces = 0;
  parts.forEach((p) => {
    const l = (Number(p.len) || 0) + k;
    const w = (Number(p.wid) || 0) + k;
    const q = Number(p.qty) || 0;
    partsArea += l * w * q;
    totalPieces += q;
  });
  // معامل هدر تقريبي 12% للتعشيش غير المثالي
  const usableFactor = 0.88;
  const sheetsNeeded = sheetArea > 0 ? Math.ceil(partsArea / (sheetArea * usableFactor)) : 0;
  const yieldPct = sheetsNeeded > 0 && sheetArea > 0 ? Math.min(100, (partsArea / (sheetsNeeded * sheetArea)) * 100) : 0;

  return (
    <div>
      <PageHeader title="حاسبة قص الألواح" subtitle="تقدير عدد الألواح المطلوبة ونسبة الاستفادة" icon={<Scissors size={22} />} />
      <Card className="mb-5">
        <CardHeader title="مقاس اللوح (مم)" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="الطول"><Input type="number" value={sheetL} onChange={(e) => setSheetL(e.target.value)} /></Field>
          <Field label="العرض"><Input type="number" value={sheetW} onChange={(e) => setSheetW(e.target.value)} /></Field>
          <Field label="سُمك المنشار (kerf) مم"><Input type="number" value={kerf} onChange={(e) => setKerf(e.target.value)} /></Field>
        </div>
      </Card>

      <Card className="mb-5">
        <CardHeader title="القطع المطلوبة" />
        <Table head={<><th>القطعة</th><th>الطول</th><th>العرض</th><th>العدد</th><th></th></>}>
          {parts.map((p, i) => (
            <tr key={i}>
              <td><Input value={p.name} onChange={(e) => setParts((x) => x.map((v, idx) => idx === i ? { ...v, name: e.target.value } : v))} placeholder="باب/رف" /></td>
              <td><Input type="number" value={p.len} onChange={(e) => setParts((x) => x.map((v, idx) => idx === i ? { ...v, len: e.target.value } : v))} /></td>
              <td><Input type="number" value={p.wid} onChange={(e) => setParts((x) => x.map((v, idx) => idx === i ? { ...v, wid: e.target.value } : v))} /></td>
              <td><Input type="number" value={p.qty} onChange={(e) => setParts((x) => x.map((v, idx) => idx === i ? { ...v, qty: e.target.value } : v))} /></td>
              <td><button className="p-1 text-danger" onClick={() => setParts((x) => x.filter((_, idx) => idx !== i))}><Trash2 size={15} /></button></td>
            </tr>
          ))}
        </Table>
        <Button size="sm" variant="outline" className="mt-3" icon={<Plus size={14} />} onClick={() => setParts((x) => [...x, { ...emptyPart }])}>إضافة قطعة</Button>
      </Card>

      <Card>
        <div className="grid gap-3 sm:grid-cols-3 text-center">
          <Stat label="إجمالي القطع" v={totalPieces.toString()} />
          <Stat label="ألواح مطلوبة (تقدير)" v={sheetsNeeded.toString()} gold />
          <Stat label="نسبة الاستفادة" v={`${yieldPct.toFixed(0)}%`} />
        </div>
        <p className="mt-3 text-center text-xs text-muted">تقدير بالمساحة مع هدر ~12%؛ للنتيجة الدقيقة استخدم برنامج تعشيش متخصّص.</p>
      </Card>
    </div>
  );
}

function Stat({ label, v, gold }: { label: string; v: string; gold?: boolean }) {
  return (
    <div className="rounded-lg border border-white/8 p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${gold ? 'text-gold' : 'text-text'}`}>{v}</p>
    </div>
  );
}
