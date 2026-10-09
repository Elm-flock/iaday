import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { authedApi } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';
import type { components } from '@/lib/api/schema';

export type User = components['schemas']['UserDto'];

/** Directorio de usuarios. Tag: `users`. */
export async function listUsers(): Promise<User[]> {
  'use cache: private';
  cacheTag('users');
  cacheLife({ stale: 60 });

  const client = await authedApi();
  return unwrap(await client.GET('/users'));
}
