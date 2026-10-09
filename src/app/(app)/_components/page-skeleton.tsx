/** Fallback de página mientras se resuelven los datos (sin texto: solo reserva espacio). */
export function PageSkeleton() {
  return (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-s20">
      <div className="h-8 w-64 rounded-md bg-surface-subtle" />
      <div className="h-4 w-96 max-w-full rounded-md bg-surface-subtle" />
      <div className="h-56 rounded-lg bg-surface-subtle" />
    </div>
  );
}
