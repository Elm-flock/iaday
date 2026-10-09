import { AppNav } from './app-nav';
import { getCurrentUser } from '@/lib/dal/session';

/** Async: lee la sesión (cache privada), por eso va dentro de <Suspense> en el layout. */
export async function AppNavWithRole() {
  const user = await getCurrentUser();
  return <AppNav role={user.role} />;
}
