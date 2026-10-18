import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Nota no bloqueante: la IA no está disponible, el resto de la página sigue funcionando. */
export function AiUnavailableNote({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <p
      role="status"
      data-testid="ai-note"
      className={cn('flex items-start gap-s10 text-body-sm text-ink-muted', className)}
    >
      <Info size={16} strokeWidth={1.75} aria-hidden="true" className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  );
}
