'use client';

import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { controlBase } from './control-styles';
import { useFormFieldControl } from './form-field';

export function Textarea({ className, rows = 4, ...props }: ComponentProps<'textarea'>) {
  const field = useFormFieldControl();
  return (
    <textarea rows={rows} {...field} className={cn(controlBase, 'py-s10', className)} {...props} />
  );
}
