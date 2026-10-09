export type RefreshVerdict = 'VALID' | 'UNKNOWN' | 'EXPIRED' | 'REUSED' | 'RACE';

export interface RefreshRecord {
  revokedAt: Date | null;
  replacedAt: Date | null;
  expiresAt: Date;
  familyExpiresAt: Date;
}

/**
 * Evalúa un refresh token presentado.
 * - REUSED: ya reemplazado fuera de la gracia o revocado -> revocar familia.
 * - RACE: reemplazado dentro de la gracia (requests paralelos) -> 401 sin revocar.
 * La detección de reuso tiene prioridad sobre la expiración (seguridad primero).
 */
export function evaluateRefresh(
  rec: RefreshRecord | null,
  now: Date,
  graceMs = 10_000,
): RefreshVerdict {
  if (!rec) return 'UNKNOWN';
  if (rec.revokedAt) return 'REUSED';
  if (rec.replacedAt)
    return now.getTime() - rec.replacedAt.getTime() <= graceMs ? 'RACE' : 'REUSED';
  if (rec.expiresAt.getTime() <= now.getTime() || rec.familyExpiresAt.getTime() <= now.getTime())
    return 'EXPIRED';
  return 'VALID';
}
