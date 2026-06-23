import type { ReactNode } from 'react';

export function Table({
  head,
  children,
  className = '',
}: {
  head: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`ax-card max-h-[70vh] overflow-auto p-0 ${className}`}
      style={{ borderRadius: 'var(--radius-xl)' }}
    >
      <table className="ax-table">
        <thead>
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
