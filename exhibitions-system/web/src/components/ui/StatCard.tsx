import type { ReactNode } from 'react';

type Tone = 'gold' | 'success' | 'danger' | 'info' | 'warning';

const tones: Record<Tone, { ring: string; icon: string; value: string }> = {
  gold: { ring: 'from-primary/20', icon: 'bg-primary/15 text-primary-hover', value: 'text-primary-hover' },
  success: { ring: 'from-success/20', icon: 'bg-success/15 text-success', value: 'text-text' },
  danger: { ring: 'from-danger/20', icon: 'bg-danger/15 text-danger', value: 'text-text' },
  info: { ring: 'from-info/20', icon: 'bg-info/15 text-info', value: 'text-text' },
  warning: { ring: 'from-warning/20', icon: 'bg-warning/15 text-warning', value: 'text-text' },
};

export function StatCard({
  label,
  value,
  icon,
  tone = 'gold',
  hint,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  hint?: string;
}) {
  const t = tones[tone];
  return (
    <div
      className={`ax-card relative overflow-hidden bg-gradient-to-bl ${t.ring} to-transparent p-5`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-muted">{label}</p>
          <p className={`mt-2 text-2xl font-extrabold ${t.value}`}>{value}</p>
          {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
        </div>
        {icon && (
          <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${t.icon}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
