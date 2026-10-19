import 'server-only';
import { cache } from 'react';
import { connection } from 'next/server';
import { authedApi } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type { components } from '@/lib/api/schema';

export type AssistantDigest = components['schemas']['DigestDto'];
export type AssistantMessage = components['schemas']['MessageDto'];

/*
 * Sin cache de Next: la conversación y las novedades son de una sola persona (ADMIN) y se leen en
 * cada request. El back vuelve a exigir ADMIN (404 al resto).
 */

/** Novedades. Cualquier fallo cuenta como "no disponibles": el asistente nunca rompe la página. */
export const getDigest = cache(async (): Promise<AssistantDigest | null> => {
  await connection();
  try {
    const client = await authedApi();
    const result = await client.GET('/assistant/digest', { params: { query: {} } });
    return result.data ?? null;
  } catch (error) {
    if (error instanceof ApiError || error instanceof TypeError) return null;
    throw error;
  }
});

/** Historial propio, del más viejo al más nuevo (el back ya lo devuelve en orden cronológico). */
export async function getMessages(limit = 30): Promise<AssistantMessage[] | null> {
  await connection();
  try {
    const client = await authedApi();
    const result = await client.GET('/assistant/messages', { params: { query: { limit } } });
    return result.data ?? null;
  } catch (error) {
    if (error instanceof ApiError || error instanceof TypeError) return null;
    throw error;
  }
}
