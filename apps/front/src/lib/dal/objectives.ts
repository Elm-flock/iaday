import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { authedApi } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';
import type { components } from '@/lib/api/schema';

export type Objective = components['schemas']['ObjectiveDto'];
export type KeyResult = components['schemas']['KeyResultDto'];

export type ObjectiveFilters = {
  cycleId?: string;
  teamId?: string;
  ownerUserId?: string;
  status?: Objective['status'];
};

/**
 * Objetivos visibles para quien consulta (PUBLISHED/CLOSED para todos; los DRAFT solo para quienes
 * pueden editarlos: lo resuelve el back). Tag: `okrs`. Los filtros son datos, nunca credenciales.
 */
export async function listObjectives(filters: ObjectiveFilters = {}): Promise<Objective[]> {
  'use cache: private';
  cacheTag('okrs');
  cacheLife({ stale: 60 });

  const client = await authedApi();
  return unwrap(await client.GET('/objectives', { params: { query: filters } }));
}

/** Objetivo con sus KRs, o `null` si no existe / no es visible (DRAFT ajeno = 404) / id inválido. Tags: `okrs`, `objective:{id}`. */
export async function getObjective(id: string): Promise<Objective | null> {
  'use cache: private';
  cacheTag('okrs', `objective:${id}`);
  cacheLife({ stale: 60 });

  const client = await authedApi();
  const result = await client.GET('/objectives/{id}', { params: { path: { id } } });
  if (result.response.status === 404 || result.response.status === 400) return null;
  return unwrap(result);
}
