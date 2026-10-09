import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'brand';
export type ButtonSize = 'sm' | 'md' | 'lg';
/** `pill` es el default del sistema (pill = acción). `md` solo para casos puntuales. */
export type ButtonShape = 'pill' | 'md';

const base =
  'inline-flex shrink-0 items-center justify-center gap-s10 whitespace-nowrap font-normal transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-border-strong bg-transparent text-ink hover:bg-surface-subtle',
  ghost: 'bg-transparent text-ink hover:bg-surface-subtle',
  danger: 'bg-danger text-on-danger hover:brightness-95',
  brand: 'border-2 border-accent bg-surface-brand text-on-brand hover:brightness-110',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-s15 text-button-sm',
  md: 'h-10 px-s20 text-button-sm',
  lg: 'h-12 px-s30 text-button',
};

const shapes: Record<ButtonShape, string> = {
  pill: 'rounded-pill',
  md: 'rounded-md',
};

type StyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  className?: string;
};

/** Clases de botón reutilizables (p. ej. un `<Link>` con aspecto de botón). */
export function buttonStyles({
  variant = 'primary',
  size = 'md',
  shape = 'pill',
  className,
}: StyleOptions = {}): string {
  return cn(base, variants[variant], sizes[size], shapes[shape], className);
}

export type ButtonProps = Omit<ComponentProps<'button'>, 'children'> &
  StyleOptions & {
    children: ReactNode;
    /** Ícono decorativo a la izquierda del texto. */
    icon?: ReactNode;
    /** Deshabilita el botón y muestra un spinner. El texto se mantiene. */
    loading?: boolean;
  };

export function Button({
  variant,
  size,
  shape,
  className,
  icon,
  loading = false,
  disabled,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles({ variant, size, shape, className })}
      {...props}
    >
      {loading ? <Spinner size={size === 'lg' ? 20 : 16} /> : icon}
      {children}
    </button>
  );
}
