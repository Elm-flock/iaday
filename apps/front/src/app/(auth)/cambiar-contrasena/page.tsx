import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ChangePasswordForm } from './_components/change-password-form';
import { logoutAction } from '../actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Link } from '@/components/ui/link';
import { getCurrentUser } from '@/lib/dal/session';
import { safeNext } from '@/lib/auth/redirect';

export const metadata: Metadata = { title: 'Cambiar contraseña' };

/** Pantalla sin shell: con la clave inicial no hay nada más para hacer que cambiarla (o salir). */
async function ChangePasswordContent({
  searchParams,
}: {
  searchParams: PageProps<'/cambiar-contrasena'>['searchParams'];
}) {
  const [{ next }, user] = await Promise.all([searchParams, getCurrentUser()]);
  const target = safeNext(Array.isArray(next) ? next[0] : next);
  const forced = user.mustChangePassword;

  return (
    <Card className="w-full max-w-sm p-s30 text-ink">
      <h1 className="mb-s5 text-heading-2 font-light tracking-heading">
        {forced ? 'Elegí tu contraseña' : 'Cambiar contraseña'}
      </h1>
      <p className="mb-s20 text-body text-ink-muted">
        {forced
          ? 'Administración te dio una contraseña inicial. Por seguridad, tenés que cambiarla antes de seguir. Después vas a poder usar la plataforma con normalidad.'
          : 'Al cambiarla, cerramos tus otras sesiones abiertas.'}
      </p>
      <ChangePasswordForm next={target} forced={forced} />
      <div className="mt-s20 flex justify-center">
        {forced ? (
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Cerrar sesión
            </Button>
          </form>
        ) : (
          <Link href="/">Volver al inicio</Link>
        )}
      </div>
    </Card>
  );
}

export default function ChangePasswordPage({ searchParams }: PageProps<'/cambiar-contrasena'>) {
  return (
    <main className="bg-noche flex flex-1 flex-col items-center justify-center gap-s30 p-s30 text-on-brand">
      <p className="text-display font-light tracking-display">Flock IT</p>
      <Suspense fallback={<div className="h-96" aria-hidden="true" />}>
        <ChangePasswordContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
