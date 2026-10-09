type CycleLike = {
  id: string;
  kind: 'ANNUAL' | 'QUARTER';
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  startDate: string;
  endDate: string;
};

/**
 * Ciclo del dashboard: el pedido por `?cycleId=` (si existe); si no, el trimestre activo que contiene
 * `today` (YYYY-MM-DD), luego cualquier trimestre activo y por último un anual activo.
 */
export function pickDashboardCycle<T extends CycleLike>(
  cycles: T[],
  requestedId: string | undefined,
  today: string,
): T | undefined {
  const requested = requestedId ? cycles.find((c) => c.id === requestedId) : undefined;
  if (requested) return requested;
  const active = cycles.filter((c) => c.status === 'ACTIVE');
  const quarters = active.filter((c) => c.kind === 'QUARTER');
  return (
    quarters.find((c) => c.startDate <= today && today <= c.endDate) ?? quarters[0] ?? active[0]
  );
}
