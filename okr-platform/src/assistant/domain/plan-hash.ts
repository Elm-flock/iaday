import { createHash, timingSafeEqual } from 'node:crypto';

/** JSON canónico: claves ordenadas recursivamente, sin espacios. Propio (no depende de ai/domain). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/**
 * Hash de confirmación: sha256 de las acciones resueltas + quién pidió + vencimiento (ISO).
 * Cambiar cualquiera de las tres cosas invalida la confirmación.
 */
export function computePlanHash(input: {
  actions: unknown;
  requestedById: string;
  expiresAt: Date;
}): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        actions: input.actions,
        requestedById: input.requestedById,
        expiresAt: input.expiresAt.toISOString(),
      }),
    )
    .digest('hex');
}

/** Comparación en tiempo constante de dos hashes hex (si el largo difiere, no coinciden). */
export function hashesMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
