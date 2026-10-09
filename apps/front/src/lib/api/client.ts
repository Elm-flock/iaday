import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE } from '@/lib/auth/constants';
import { createApiClient } from './create-client';

/**
 * Cliente de la API con el Bearer tomado de la cookie `okr_at`.
 * - Sin cookie, o 401 de Nest → redirect('/login'). No se pueden setear cookies durante el
 *   render; la renovación la hace src/proxy.ts.
 * - Debe usarse dentro de <Suspense> o de un scope 'use cache: private' (lee cookies()).
 * - El token NUNCA debe pasar como argumento de una función 'use cache' (queda en texto plano).
 */
export async function authedApi() {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) redirect('/login');

  const client = createApiClient({ token });
  client.use({
    onResponse({ response }) {
      if (response.status === 401) redirect('/login');
    },
  });
  return client;
}

/** Cliente sin credenciales (login, refresh). */
export function publicApi() {
  return createApiClient();
}
