import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { authedApi } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';
import type { components } from '@/lib/api/schema';

export type CheckIn = components['schemas']['CheckInDto'];
export type PendingCheckIn = components['schemas']['PendingCheckInDto'];

/** Mis KRs vencidos (propios y, si soy líder, los de mi equipo). Tag: `check-ins:pending`. */
export async function listPendingCheckIns(): Promise<PendingCheckIn[]> {
  'use cache: private';
  cacheTag('check-ins:pending');
  cacheLife({ stale: 60 });

  const client = await authedApi();
  return unwrap(await client.GET('/check-ins/pending'));
}

/** Historial de un KR, del más nuevo al más viejo; `[]` si no existe / no es visible. Tags: `okrs`, `kr:{id}`. */
export async function listKrCheckIns(krId: string): Promise<CheckIn[]> {
  'use cache: private';
  cacheTag('okrs', `kr:${krId}`);
  cacheLife({ stale: 60 });

  const client = await authedApi();
  const result = await client.GET('/key-results/{id}/check-ins', {
    params: { path: { id: krId } },
  });
  if (result.response.status === 404 || result.response.status === 400) return [];
  return unwrap(result);
}
