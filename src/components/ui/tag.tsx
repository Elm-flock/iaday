import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Etiqueta / chip de categoría (pill, neutra). */
export function Tag({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-pill border border-border bg-surface-subtle px-s10 text-caption text-ink',
        className,
      )}
      {...props}
    />
  );
}
