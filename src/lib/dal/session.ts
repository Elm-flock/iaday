import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { authedApi } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';
import type { components } from '@/lib/api/schema';

type Me = components['schemas']['MeDto'];

/** Datos acotados del usuario: nada de email ni tokens viajan a la UI. */
export type CurrentUser = Pick<Me, 'id' | 'name' | 'role' | 'teams' | 'mustChangePassword'>;

/**
 * Usuario actual vía GET /auth/me. 'use cache: private' lee cookies() sin que el token entre
 * en la cache key y guarda el resultado solo en el browser. `updateTag('me')` lo invalida.
 * Debe llamarse detrás de <Suspense>.
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  'use cache: private';
  cacheTag('me');
  cacheLife({ stale: 300 });

  const client = await authedApi();
  const me = unwrap(await client.GET('/auth/me'));
  return {
    id: me.id,
    name: me.name,
    role: me.role,
    teams: me.teams,
    mustChangePassword: me.mustChangePassword,
  };
}
