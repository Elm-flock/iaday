'use client';

import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { controlBase } from './control-styles';
import { useFormFieldControl } from './form-field';

/** Select nativo con estilo. Pasá `<option>` como children. */
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  const field = useFormFieldControl();
  return (
    <span className="relative block">
      <select
        {...field}
        className={cn(controlBase, 'h-10 appearance-none pr-s40', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={18}
        strokeWidth={1.75}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-s15 -translate-y-1/2 text-ink-muted"
      />
    </span>
  );
}
