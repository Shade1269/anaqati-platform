import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

export function Label({ children }: { children: ReactNode }) {
  return <label className="ax-label">{children}</label>;
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ax-input ${className}`} {...rest} />;
}

export function Select({
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`ax-select ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
