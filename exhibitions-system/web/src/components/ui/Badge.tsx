import type { ReactNode } from 'react';

type Tone = 'gold' | 'success' | 'danger' | 'warning' | 'info' | 'neutral';

const tones: Record<Tone, string> = {
  gold: 'bg-primary/15 text-primary-hover',
  success: 'bg-success/15 text-success',
  danger: 'bg-danger/15 text-danger',
  warning: 'bg-warning/15 text-warning',
  info: 'bg-info/15 text-info',
  neutral: 'bg-white/5 text-muted',
};

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return <span className={`ax-badge ${tones[tone]}`}>{children}</span>;
}

const statusMap: Record<string, { tone: Tone; label: string }> = {
  active: { tone: 'success', label: 'مفعّل' },
  planning: { tone: 'info', label: 'تخطيط' },
  open: { tone: 'success', label: 'مفتوح' },
  closed: { tone: 'neutral', label: 'مغلق' },
  suspended: { tone: 'danger', label: 'موقوف' },
  pending: { tone: 'warning', label: 'قيد المراجعة' },
  approved: { tone: 'success', label: 'معتمد' },
  paid: { tone: 'gold', label: 'مدفوع' },
  cancelled: { tone: 'danger', label: 'ملغى' },
  rejected: { tone: 'danger', label: 'مرفوض' },
};

export function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-muted">—</span>;
  const m = statusMap[status] || { tone: 'neutral' as Tone, label: status };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
