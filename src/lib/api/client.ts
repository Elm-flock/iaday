import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  ACCESS_COOKIE,
  CHANGE_PASSWORD_PATH,
  PASSWORD_CHANGE_REQUIRED_CODE,
} from '@/lib/auth/constants';
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
    async onResponse({ response }) {
      if (response.status === 401) redirect('/login');
      // Clave inicial sin cambiar: el back solo deja pasar el cambio de contraseña. Se resuelve
      // acá, una sola vez, para que ninguna pantalla ni acción tenga que conocer ese estado.
      if (response.status === 403) {
        const body: unknown = await response
          .clone()
          .json()
          .catch(() => null);
        if ((body as { code?: unknown } | null)?.code === PASSWORD_CHANGE_REQUIRED_CODE) {
          redirect(CHANGE_PASSWORD_PATH);
        }
      }
    },
  });
  return client;
}

/** Cliente sin credenciales (login, refresh). */
export function publicApi() {
  return createApiClient();
}
