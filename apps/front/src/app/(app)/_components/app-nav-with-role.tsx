import { AppNav } from './app-nav';
import { listPendingCheckIns } from '@/lib/dal/check-ins';
import { getCurrentUser } from '@/lib/dal/session';

/**
 * Async: lee la sesión y los pendientes (ambos con cache privada), por eso va dentro de <Suspense> en el
 * layout y el shell sigue siendo estático. El contador es accesorio: si falla traerlo, el nav se muestra
 * igual sin contador (la sesión SÍ propaga su error: un 401 redirige a /login).
 */
export async function AppNavWithRole() {
  const [user, pending] = await Promise.all([
    getCurrentUser(),
    listPendingCheckIns().catch(() => null),
  ]);
  return <AppNav role={user.role} pendingCheckIns={pending?.length} />;
}
