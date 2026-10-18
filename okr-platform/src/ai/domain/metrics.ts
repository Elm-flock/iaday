/** Agregaciones puras de uso e impacto (se usan sobre filas ya agregadas por SQL). Sin datos por persona. */

/** Interpolación lineal (equivalente a percentile_cont); null si no hay datos. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(Math.max(p, 0), 1) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

/** num/den redondeado a 4 decimales; null si den = 0 (no se inventa un 0 %). */
export function ratio(num: number, den: number): number | null {
  return den > 0 ? Math.round((num / den) * 10_000) / 10_000 : null;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}

/** Costo estimado por usuario activo (usuarios distintos que hicieron al menos una llamada). */
export function costPerActiveUser(totalCostUsd: number, activeUsers: number): number | null {
  return activeUsers > 0 ? Math.round((totalCostUsd / activeUsers) * 1e8) / 1e8 : null;
}

/** Aceptadas = ACCEPTED o VALIDATED (NEEDS_REVIEW y DRAFT no cuentan). */
export function adaptationAdoption(statusCounts: Record<string, number>): {
  total: number;
  accepted: number;
  rate: number | null;
} {
  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const accepted = (statusCounts.ACCEPTED ?? 0) + (statusCounts.VALIDATED ?? 0);
  return { total, accepted, rate: ratio(accepted, total) };
}

/** Rango por defecto: últimos 30 días hasta `now`; normaliza from/to invertidos. */
export function resolveRange(
  from: Date | undefined,
  to: Date | undefined,
  now: Date = new Date(),
): { from: Date; to: Date } {
  const end = to ?? now;
  const start = from ?? new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}
