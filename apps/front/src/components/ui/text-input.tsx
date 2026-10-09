'use client';

import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { controlBase } from './control-styles';
import { useFormFieldControl } from './form-field';

export function TextInput({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  const field = useFormFieldControl();
  return <input type={type} {...field} className={cn(controlBase, 'h-10', className)} {...props} />;
}
