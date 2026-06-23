import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  icon,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary-hover">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-xl font-extrabold text-text">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  showLabel = true,
}: {
  value: number;
  max: number;
  showLabel?: boolean;
}) {
  const ratio = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className="animate-grow h-full rounded-full transition-all duration-700"
          style={{
            width: `${ratio}%`,
            background:
              'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary-hover)))',
            boxShadow: '0 0 12px hsl(var(--primary) / 0.5)',
          }}
        />
      </div>
      {showLabel && (
        <p className="mt-1.5 text-xs font-semibold text-gold">{ratio}%</p>
      )}
    </div>
  );
}
