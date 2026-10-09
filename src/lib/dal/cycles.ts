import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { authedApi } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';
import type { components } from '@/lib/api/schema';

export type Cycle = components['schemas']['CycleDto'];

/** Todos los ciclos (anuales y trimestrales), ordenados por fecha de inicio. Tag: `cycles`. */
export async function listCycles(): Promise<Cycle[]> {
  'use cache: private';
  cacheTag('cycles');
  cacheLife({ stale: 60 });

  const client = await authedApi();
  return unwrap(await client.GET('/cycles'));
}

/** Un ciclo o `null` si no existe / el id no es válido. Tags: `cycles`, `cycle:{id}`. */
export async function getCycle(id: string): Promise<Cycle | null> {
  'use cache: private';
  cacheTag('cycles', `cycle:${id}`);
  cacheLife({ stale: 60 });

  const client = await authedApi();
  const result = await client.GET('/cycles/{id}', { params: { path: { id } } });
  if (result.response.status === 404 || result.response.status === 400) return null;
  return unwrap(result);
}
