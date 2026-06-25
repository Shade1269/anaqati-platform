// عملة المشترك الحالية (تُضبط عند تحميل الملف الشخصي/جلسة الموظف/المتجر)
const CURRENCY_SYMBOLS: Record<string, string> = {
  SAR: 'ر.س', SYP: 'ل.س', USD: '$', TRY: '₺', EUR: '€', AED: 'د.إ', EGP: 'ج.م', JOD: 'د.أ',
};
let _symbol = 'ر.س';

export function setCurrency(code?: string | null): void {
  if (!code) { _symbol = 'ر.س'; return; }
  _symbol = CURRENCY_SYMBOLS[code] || code;
}
export function currencyLabel(): string {
  return _symbol;
}

export function sar(value: number | null | undefined): string {
  const n = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${_symbol}`;
}

// منسّق المبالغ الموحّد (يستخدمه باقي الوحدات بدل المنسّق المحلي)
export function money(value: number | null | undefined): string {
  const n = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  return `${(Math.round(n * 100) / 100).toFixed(2)} ${_symbol}`;
}

export function pct(value: number | null | undefined): string {
  const n = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  return `${n}%`;
}

const dateFmt = new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

const dateTimeFmt = new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return dateFmt.format(d);
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return dateTimeFmt.format(d);
}
