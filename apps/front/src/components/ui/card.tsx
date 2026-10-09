import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type CardProps = ComponentProps<'section'> & {
  /** Título de la card (heading-3). */
  title?: ReactNode;
  /** Acciones alineadas a la derecha del título. */
  actions?: ReactNode;
};

export function Card({ title, actions, className, children, ...props }: CardProps) {
  return (
    <section
      className={cn('rounded-lg border border-border bg-surface p-s20 shadow-sm', className)}
      {...props}
    >
      {title || actions ? (
        <header className="mb-s15 flex items-center justify-between gap-s10">
          {title ? (
            <h3 className="text-heading-3 font-light tracking-heading text-ink">{title}</h3>
          ) : (
            <span />
          )}
          {actions}
        </header>
      ) : null}
      {children}
    </section>
  );
}
