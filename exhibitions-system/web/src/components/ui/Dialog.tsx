import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className={`ax-card animate-fade-up relative z-10 w-full ${widths[size]} max-h-[88vh] overflow-auto p-0`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h3 className="text-base font-bold text-text">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted transition hover:bg-white/10 hover:text-text"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
