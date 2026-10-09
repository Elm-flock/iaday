import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { authedApi } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';
import type { components } from '@/lib/api/schema';

export type TeamNode = components['schemas']['TeamNodeDto'];
export type TeamDetail = components['schemas']['TeamDetailDto'];

/** Árbol de equipos (raíz = organización). Tag: `teams`. */
export async function getTeamTree(): Promise<TeamNode[]> {
  'use cache: private';
  cacheTag('teams');
  cacheLife({ stale: 60 });

  const client = await authedApi();
  return unwrap(await client.GET('/teams'));
}

/**
 * Detalle del equipo con miembros y, si hay `cycleId`, la mezcla de origen (top-down/bottom-up).
 * `null` si el equipo (o el ciclo) no existe. Tags: `teams`, `team:{id}` y, con ciclo, `cycle:{id}` y `okrs`
 * (la mezcla cambia cuando cambian los objetivos).
 */
export async function getTeamDetail(id: string, cycleId?: string): Promise<TeamDetail | null> {
  'use cache: private';
  cacheTag('teams', `team:${id}`);
  if (cycleId) cacheTag(`cycle:${cycleId}`, 'okrs');
  cacheLife({ stale: 60 });

  const client = await authedApi();
  const result = await client.GET('/teams/{id}', {
    params: { path: { id }, query: cycleId ? { cycleId } : {} },
  });
  if (result.response.status === 404 || result.response.status === 400) return null;
  return unwrap(result);
}
