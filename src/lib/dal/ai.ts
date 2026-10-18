import 'server-only';
import { cache } from 'react';
import { connection } from 'next/server';
import { authedApi } from '@/lib/api/client';
import { ApiError, unwrap } from '@/lib/api/errors';
import type { components } from '@/lib/api/schema';

export type AdaptedContent = components['schemas']['AdaptedContentDto'];
export type AiSuggestion = components['schemas']['AiSuggestionDto'];
export type AiUsage = components['schemas']['UsageDto'];
export type AiImpact = components['schemas']['ImpactDto'];

/*
 * Sin cache persistente (ni `'use cache'` ni `unstable_cache`): son lecturas dinámicas por request.
 * Las adaptaciones de feedback son tan privadas como el feedback; el contenido de IA nunca se guarda
 * en la cache de Next. `cache()` de React solo deduplica dentro de UN render (varios check-ins de la
 * misma página preguntan el estado una sola vez).
 */

/**
 * ¿Está activa la ayuda de IA? Cualquier fallo (API caída, 5xx) cuenta como "no disponible": la IA
 * es accesoria y nunca debe romper la página que la ofrece.
 */
export const getAiStatus = cache(async (): Promise<{ enabled: boolean }> => {
  await connection();
  try {
    const client = await authedApi();
    const result = await client.GET('/ai/status');
    return { enabled: result.data?.enabled === true };
  } catch (error) {
    // redirect('/login') (401) y demás errores internos de Next se propagan.
    if (error instanceof ApiError || error instanceof TypeError) return { enabled: false };
    throw error;
  }
});

export const AI_RANGE_DAYS = [7, 30, 90] as const;
export type AiRangeDays = (typeof AI_RANGE_DAYS)[number];
export const DEFAULT_AI_RANGE_DAYS: AiRangeDays = 30;

/** Rango en días desde `?dias=`; cualquier otro valor cae en el default. */
export function parseRangeDays(raw: string | string[] | undefined): AiRangeDays {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return AI_RANGE_DAYS.find((d) => d === value) ?? DEFAULT_AI_RANGE_DAYS;
}

/** `from` ISO de "los últimos N días". Se calcula DESPUÉS de `connection()` (regla de prerender de Next 16.4). */
const sinceDays = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/** Uso de IA de los últimos N días (solo ADMIN: el back responde 403 al resto). Agregado, sin datos por persona. */
export async function getAiUsage(days: AiRangeDays = DEFAULT_AI_RANGE_DAYS): Promise<AiUsage> {
  await connection();
  const client = await authedApi();
  return unwrap(await client.GET('/ai/usage', { params: { query: { from: sinceDays(days) } } }));
}

/** Métricas de impacto de los últimos N días (solo ADMIN). Agregado, sin rankings ni datos por persona. */
export async function getAiImpact(days: AiRangeDays = DEFAULT_AI_RANGE_DAYS): Promise<AiImpact> {
  await connection();
  const client = await authedApi();
  return unwrap(await client.GET('/ai/impact', { params: { query: { from: sinceDays(days) } } }));
}
