import type { ReactNode } from 'react';

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`ax-card p-5 ${className}`}>{children}</div>;
}

export function CardHeader({
  title,
  icon,
  action,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-base font-bold text-text">
        {icon && <span className="text-gold">{icon}</span>}
        {title}
      </h2>
      {action}
    </div>
  );
}
