import { createHash } from 'node:crypto';

/** JSON con claves ordenadas recursivamente: misma entrada lógica, mismos bytes. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * sha256(JSON canónico de segmentos minimizados + level). Clave puramente de TEXTO FUENTE: el prompt
 * NO entra (si entrara, un cambio de prompt dejaría huérfanas también las versiones validadas por
 * personas). La vigencia del prompt se decide aparte (domain/adaptation-cache.ts).
 */
export function sourceHash(segments: { key: string; text: string }[], level: string): string {
  return createHash('sha256').update(canonicalJson({ segments, level })).digest('hex');
}
