import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type TooltipProps = {
  /** Texto breve. Es solo visual: el nombre accesible lo da el elemento envuelto. */
  label: string;
  children: ReactNode;
  className?: string;
};

/** Tooltip CSS (hover y foco de teclado). No requiere JS. */
export function Tooltip({ label, children, className }: TooltipProps) {
  return (
    <span className={cn('group/tooltip relative inline-flex', className)}>
      {children}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-full left-1/2 z-50 mt-s5 -translate-x-1/2 rounded-sm bg-ink px-s10 py-s5 text-caption whitespace-nowrap text-bg opacity-0 shadow-overlay transition-opacity duration-150 ease-out group-focus-within/tooltip:opacity-100 group-hover/tooltip:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
