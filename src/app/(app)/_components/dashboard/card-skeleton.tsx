/** Fallback de una card del dashboard (sin texto: solo reserva espacio). */
export function CardSkeleton({ className = 'h-48' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`animate-pulse rounded-lg bg-surface-subtle ${className}`} />
  );
}
