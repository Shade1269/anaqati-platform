import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'outline' | 'danger' | 'success';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'ax-btn-primary',
  ghost: 'ax-btn-ghost',
  outline: 'ax-btn-outline',
  danger: 'ax-btn-danger',
  success: 'ax-btn-success',
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: '',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  children,
  className = '',
  disabled,
  ...rest
}: Props) {
  return (
    <button
      className={`ax-btn ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
