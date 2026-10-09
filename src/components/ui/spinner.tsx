import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

type SpinnerProps = {
  /** Texto para lectores de pantalla. Si se omite, el spinner es decorativo. */
  label?: string;
  size?: number;
  className?: string;
};

export function Spinner({ label, size = 18, className }: SpinnerProps) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : true}
      className={cn('inline-flex', className)}
    >
      <LoaderCircle size={size} strokeWidth={1.75} className="animate-spin" aria-hidden="true" />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
