export function sar(value: number | null | undefined): string {
  const n = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ر.س`;
}

export function pct(value: number | null | undefined): string {
  const n = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  return `${n}%`;
}
