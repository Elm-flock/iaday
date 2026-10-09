import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { authedApi } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';
import type { components } from '@/lib/api/schema';

export type Recognition = components['schemas']['RecognitionDto'];
export type RecognitionPage = components['schemas']['RecognitionPageDto'];

export const RECOGNITIONS_PAGE_SIZE = 10;

/** Muro público (visible para cualquier persona autenticada), más nuevo primero. Tag: `recognitions`. */
export async function listRecognitions(
  page: number,
  toUserId?: string,
  limit: number = RECOGNITIONS_PAGE_SIZE,
): Promise<RecognitionPage> {
  'use cache: private';
  cacheTag('recognitions');
  cacheLife({ stale: 60 });

  const client = await authedApi();
  return unwrap(
    await client.GET('/recognitions', {
      params: { query: { page, limit, ...(toUserId ? { toUserId } : {}) } },
    }),
  );
}
