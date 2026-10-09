import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { CreateUserButton } from './_components/user-modals';
import { UsersTable } from './_components/users-table';
import { PageSkeleton } from '../../_components/page-skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { getCurrentUser } from '@/lib/dal/session';
import { listUsers } from '@/lib/dal/users';

export const metadata: Metadata = { title: 'Usuarios' };

async function UsersContent() {
  const [user, users] = await Promise.all([getCurrentUser(), listUsers()]);
  // Solo administración: el resto recibe 404 (no se revela que la sección existe). El back vuelve a
  // chequear el rol en cada mutación.
  if (user.role !== 'ADMIN') notFound();

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Alta de personas, roles y accesos. Solo administración ve esta sección."
        actions={<CreateUserButton />}
      />
      <UsersTable users={users} currentUserId={user.id} />
    </>
  );
}

export default function UsuariosPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <UsersContent />
    </Suspense>
  );
}
