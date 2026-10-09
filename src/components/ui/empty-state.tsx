import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Acción sugerida (un Button). */
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-s10 rounded-lg border border-dashed border-border-strong px-s30 py-s40 text-center',
        className,
      )}
    >
      {icon ? <span className="text-ink-muted">{icon}</span> : null}
      <h3 className="text-heading-3 font-light tracking-heading text-ink">{title}</h3>
      {description ? <p className="max-w-md text-body text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-s10">{action}</div> : null}
    </div>
  );
}
