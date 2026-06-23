import { BellOff, Check } from 'lucide-react';
import type { NotificationRow } from '../../lib/types';
import { fmtDateTime } from '../../lib/format';
import { Spinner } from '../ui';

export function NotificationsPanel({
  loading,
  items,
  onMarkRead,
}: {
  loading: boolean;
  items: NotificationRow[];
  onMarkRead: (id: string) => void;
}) {
  if (loading) return <Spinner />;
  if (items.length === 0)
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-muted">
        <BellOff size={28} />
        <p className="text-sm">لا توجد إشعارات</p>
      </div>
    );

  return (
    <div className="space-y-2">
      {items.map((n) => (
        <div
          key={n.id}
          className={`rounded-lg border px-4 py-3 transition ${
            n.is_read
              ? 'border-white/5 bg-transparent'
              : 'border-primary/30 bg-primary/5'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-text">
                {!n.is_read && (
                  <span className="ml-1 inline-block h-2 w-2 rounded-full bg-primary align-middle" />
                )}{' '}
                {n.title}
              </p>
              {n.body && <p className="mt-1 text-xs text-muted">{n.body}</p>}
              <p className="mt-1.5 text-[11px] text-muted/70">
                {fmtDateTime(n.created_at)}
              </p>
            </div>
            {!n.is_read && (
              <button
                onClick={() => onMarkRead(n.id)}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-xs font-semibold text-muted hover:bg-white/10 hover:text-text"
              >
                <Check size={13} /> تمييز
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
