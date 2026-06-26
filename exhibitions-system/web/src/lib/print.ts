import { currencyLabel } from './format';

export interface PrintLine {
  name: string;
  qty?: number | string;
  amount: number; // إجمالي السطر
  note?: string | null;
}

export interface ReceiptData {
  brand: string;            // اسم المحل/العلامة
  title: string;            // عنوان المستند (فاتورة / إيصال / عرض سعر)
  ref?: string;             // رقم المرجع
  meta?: { label: string; value: string }[]; // أسطر معلومات (عميل/طاولة/تاريخ)
  lines: PrintLine[];
  total: number;
  extraTotals?: { label: string; value: number }[]; // قبل الإجمالي (توصيل/خصم/تكلفة)
  footer?: string;          // سطر شكر/ملاحظة
  paid?: string;            // طريقة الدفع
}

const fmt = (n: number) => `${(Math.round((n || 0) * 100) / 100).toFixed(2)} ${currencyLabel()}`;
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));

/** يفتح نافذة طباعة بإيصال حراري بعرض 80مم (يصلح أيضًا لـ A4). */
export function printReceipt(d: ReceiptData): void {
  const now = new Date();
  const dateStr = now.toLocaleString('en-GB', { hour12: false }).replace(',', '');
  const meta = (d.meta || []).map((m) => `<div class="row"><span>${esc(m.label)}</span><span>${esc(m.value)}</span></div>`).join('');
  const lines = d.lines
    .map(
      (l) => `<div class="item">
        <div class="row"><span class="nm">${esc(l.name)}</span><span>${fmt(l.amount)}</span></div>
        ${l.qty != null ? `<div class="sub">${esc(l.qty)} ×</div>` : ''}
        ${l.note ? `<div class="sub">${esc(l.note)}</div>` : ''}
      </div>`
    )
    .join('');
  const extra = (d.extraTotals || [])
    .map((t) => `<div class="row"><span>${esc(t.label)}</span><span>${fmt(t.value)}</span></div>`)
    .join('');

  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(d.title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Cairo','Tahoma',sans-serif; width: 80mm; margin: 0 auto; padding: 6px 8px; color: #000; }
    .center { text-align: center; }
    .brand { font-size: 18px; font-weight: 800; }
    .title { font-size: 13px; margin-top: 2px; }
    .ref { font-size: 11px; color: #333; }
    hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; padding: 1px 0; }
    .item { padding: 2px 0; }
    .nm { font-weight: 600; }
    .sub { font-size: 11px; color: #444; }
    .total { font-size: 15px; font-weight: 800; }
    .foot { text-align: center; font-size: 11px; margin-top: 8px; }
    @media print { @page { margin: 0; } body { width: 80mm; } }
  </style></head><body>
    <div class="center">
      <div class="brand">${esc(d.brand)}</div>
      <div class="title">${esc(d.title)}</div>
      ${d.ref ? `<div class="ref">${esc(d.ref)}</div>` : ''}
      <div class="ref">${dateStr}</div>
    </div>
    <hr>
    ${meta}
    ${meta ? '<hr>' : ''}
    ${lines}
    <hr>
    ${extra}
    <div class="row total"><span>الإجمالي</span><span>${fmt(d.total)}</span></div>
    ${d.paid ? `<div class="row"><span>الدفع</span><span>${esc(d.paid)}</span></div>` : ''}
    <div class="foot">${esc(d.footer || 'شكرًا لزيارتكم')}</div>
    <script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)}</script>
  </body></html>`;

  const w = window.open('', '_blank', 'width=380,height=600');
  if (!w) {
    alert('فعّل النوافذ المنبثقة للطباعة');
    return;
  }
  w.document.write(html);
  w.document.close();
}
