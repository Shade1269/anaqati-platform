export function sar(value: number | null | undefined): string {
  const n = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ر.س`;
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
