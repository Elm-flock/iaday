import { KeyRound, LogOut } from 'lucide-react';
import NextLink from 'next/link';
import { redirect } from 'next/navigation';
import { logoutAction } from '../../(auth)/actions';
import { Avatar } from '@/components/ui/avatar';
import { Button, buttonStyles } from '@/components/ui/button';
import { CHANGE_PASSWORD_PATH } from '@/lib/auth/constants';
import { getCurrentUser, type CurrentUser } from '@/lib/dal/session';

const ROLE_LABEL: Record<CurrentUser['role'], string> = {
  ADMIN: 'Administración',
  LEADER: 'Líder',
  MEMBER: 'Integrante',
};

/** Async: lee la sesión, por eso debe renderizarse dentro de <Suspense>. */
export async function UserMenu() {
  const user = await getCurrentUser();
  // Red de seguridad: con la clave inicial sin cambiar no se muestra el shell de la app.
  if (user.mustChangePassword) redirect(CHANGE_PASSWORD_PATH);
  return (
    <div className="flex items-center gap-s15">
      <Avatar name={user.name} className="bg-on-brand text-surface-brand" />
      <div className="hidden flex-col sm:flex">
        <span className="text-body leading-5">{user.name}</span>
        <span className="text-caption text-on-brand/80">{ROLE_LABEL[user.role]}</span>
      </div>
      <NextLink
        href={CHANGE_PASSWORD_PATH}
        aria-label="Cambiar contraseña"
        className={buttonStyles({
          variant: 'ghost',
          size: 'sm',
          className: 'text-on-brand hover:bg-white/10',
        })}
      >
        <KeyRound size={16} strokeWidth={1.75} aria-hidden="true" />
        <span className="hidden lg:inline">Cambiar contraseña</span>
      </NextLink>
      <form action={logoutAction}>
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          icon={<LogOut size={16} strokeWidth={1.75} aria-hidden="true" />}
          className="text-on-brand hover:bg-white/10"
        >
          Cerrar sesión
        </Button>
      </form>
    </div>
  );
}

export function UserMenuFallback() {
  return <div aria-hidden="true" className="h-8 w-40 animate-pulse rounded-pill bg-white/10" />;
}
