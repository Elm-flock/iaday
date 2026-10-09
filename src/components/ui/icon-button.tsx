import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Tooltip } from './tooltip';

type IconButtonProps = Omit<ComponentProps<'button'>, 'children' | 'aria-label'> & {
  /** Obligatorio: nombre accesible y texto del tooltip. */
  'aria-label': string;
  /** El ícono (Lucide, 16–20px). */
  children: ReactNode;
  variant?: 'ghost' | 'secondary';
  /** Alineación del tooltip; `start` para botones pegados al borde izquierdo. */
  tooltipAlign?: 'center' | 'start';
};

export function IconButton({
  'aria-label': label,
  children,
  variant = 'ghost',
  tooltipAlign,
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <Tooltip label={label} align={tooltipAlign}>
      <button
        type={type}
        aria-label={label}
        className={cn(
          'inline-flex size-10 items-center justify-center rounded-pill text-ink-muted transition-colors duration-150 ease-out hover:bg-surface-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-40',
          variant === 'secondary' && 'border border-border-strong',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    </Tooltip>
  );
}
