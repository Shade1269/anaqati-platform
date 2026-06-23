import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

export function Spinner({ label = 'جارٍ التحميل...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-muted">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-white/5 ${className}`}
      style={{ minHeight: 16 }}
    />
  );
}

export function EmptyState({
  message = 'لا توجد بيانات',
  icon,
  action,
}: {
  message?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ax-card flex flex-col items-center justify-center gap-3 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5 text-muted">
        {icon || <Inbox size={26} />}
      </div>
      <p className="text-sm text-muted">{message}</p>
      {action}
    </div>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
      {message}
    </div>
  );
}
