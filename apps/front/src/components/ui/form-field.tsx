'use client';

import { createContext, useContext, useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type FormFieldContextValue = {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
};

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

/**
 * Props de accesibilidad que un control (TextInput, Select...) toma del FormField que lo envuelve.
 * Fuera de un FormField devuelve un objeto vacío.
 */
export function useFormFieldControl(): {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  required?: boolean;
} {
  const ctx = useContext(FormFieldContext);
  if (!ctx) return {};
  return {
    id: ctx.id,
    'aria-describedby': ctx.describedBy,
    'aria-invalid': ctx.invalid ? true : undefined,
    required: ctx.required || undefined,
  };
}

type FormFieldProps = {
  label: string;
  required?: boolean;
  help?: string;
  /** Mensaje de error: qué pasó + cómo seguir. */
  error?: string;
  className?: string;
  /** El control: TextInput, Textarea, Select, etc. */
  children: ReactNode;
};

export function FormField({
  label,
  required = false,
  help,
  error,
  className,
  children,
}: FormFieldProps) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined;

  return (
    <FormFieldContext value={{ id, describedBy, invalid: Boolean(error), required }}>
      <div className={cn('flex flex-col gap-s5', className)}>
        <label htmlFor={id} className="text-body-sm text-ink-muted">
          {label}
          {required ? (
            <span aria-hidden="true" className="ml-s5 text-danger">
              *
            </span>
          ) : null}
        </label>
        {children}
        {help ? (
          <p id={helpId} className="text-body-sm text-ink-muted">
            {help}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} role="alert" className="text-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </FormFieldContext>
  );
}
