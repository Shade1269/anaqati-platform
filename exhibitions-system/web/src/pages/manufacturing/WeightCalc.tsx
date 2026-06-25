import { useState } from 'react';
import { Scale } from 'lucide-react';
import { Button, Card, CardHeader, Field, Input, PageHeader } from '../../components/ui';

const DENSITIES: Record<string, number> = {
  'حديد/صلب': 7.85, 'ألمنيوم': 2.70, 'نحاس': 8.96, 'ستانلس': 8.00, 'نحاس أصفر': 8.50,
};
import { money } from '../../lib/format';
/** حاسبة الوزن (معادن): الأبعاد + الكثافة → الوزن → التكلفة. */
export default function WeightCalc() {
  const [shape, setShape] = useState<'sheet' | 'bar'>('sheet');
  const [len, setLen] = useState('');   // mm
  const [wid, setWid] = useState('');   // mm (للوح)
  const [thk, setThk] = useState('');   // mm (للوح) أو القطر للقضيب
  const [density, setDensity] = useState('7.85'); // g/cm3
  const [pricePerKg, setPricePerKg] = useState('');
  const [qty, setQty] = useState('1');

  const d = Number(density) || 0;
  const L = Number(len) || 0, W = Number(wid) || 0, T = Number(thk) || 0, Q = Number(qty) || 0;
  // الحجم سم³ : تحويل مم→سم (÷10 لكل بُعد)
  let volCm3 = 0;
  if (shape === 'sheet') volCm3 = (L / 10) * (W / 10) * (T / 10);
  else volCm3 = Math.PI * Math.pow((T / 10) / 2, 2) * (L / 10); // قضيب أسطواني، T=القطر
  const weightKg = (volCm3 * d) / 1000;
  const totalWeight = weightKg * Q;
  const cost = totalWeight * (Number(pricePerKg) || 0);

  return (
    <div>
      <PageHeader title="حاسبة الوزن والتكلفة" subtitle="احسب وزن المعدن من الأبعاد وكلفته" icon={<Scale size={22} />} />
      <Card className="mb-5">
        <CardHeader title="الأبعاد" />
        <div className="mb-4 flex gap-2">
          <Button size="sm" variant={shape === 'sheet' ? 'primary' : 'outline'} onClick={() => setShape('sheet')}>لوح/مستطيل</Button>
          <Button size="sm" variant={shape === 'bar' ? 'primary' : 'outline'} onClick={() => setShape('bar')}>قضيب دائري</Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="الطول (مم)"><Input type="number" value={len} onChange={(e) => setLen(e.target.value)} /></Field>
          {shape === 'sheet' && <Field label="العرض (مم)"><Input type="number" value={wid} onChange={(e) => setWid(e.target.value)} /></Field>}
          <Field label={shape === 'sheet' ? 'السُمك (مم)' : 'القطر (مم)'}><Input type="number" value={thk} onChange={(e) => setThk(e.target.value)} /></Field>
          <Field label="الكثافة (غ/سم³)">
            <Input type="number" step="0.01" value={density} onChange={(e) => setDensity(e.target.value)} list="dens" />
          </Field>
          <Field label="السعر/كغ"><Input type="number" step="0.01" value={pricePerKg} onChange={(e) => setPricePerKg(e.target.value)} /></Field>
          <Field label="العدد"><Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(DENSITIES).map(([k, v]) => (
            <button key={k} className="rounded-lg bg-surface-2 px-3 py-1 text-xs text-muted hover:text-text" onClick={() => setDensity(String(v))}>{k}</button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="grid gap-3 sm:grid-cols-3 text-center">
          <Stat label="وزن القطعة" v={`${weightKg.toFixed(3)} كغ`} />
          <Stat label="الوزن الكلي" v={`${totalWeight.toFixed(3)} كغ`} />
          <Stat label="التكلفة" v={money(cost)} gold />
        </div>
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
