import { UserRowActions } from './user-modals';
import { ROLE_LABEL } from '../messages';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tag } from '@/components/ui/tag';
import type { components } from '@/lib/api/schema';

type User = components['schemas']['UserDto'];

/** Tabla de usuarios. Presentacional: la fila delega las acciones a una hoja cliente. */
export function UsersTable({ users, currentUserId }: { users: User[]; currentUserId: string }) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-left text-body">
        <caption className="sr-only">Usuarios de la plataforma</caption>
        <thead>
          <tr className="border-b border-border text-body-sm text-ink-muted">
            <th scope="col" className="px-s20 py-s10 font-normal">
              Nombre
            </th>
            <th scope="col" className="px-s20 py-s10 font-normal">
              Email
            </th>
            <th scope="col" className="px-s20 py-s10 font-normal">
              Rol
            </th>
            <th scope="col" className="px-s20 py-s10 font-normal">
              Estado
            </th>
            <th scope="col" className="px-s20 py-s10 text-right font-normal">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-border last:border-b-0">
              <th scope="row" className="px-s20 py-s10 font-normal">
                <span className="flex items-center gap-s10">
                  <Avatar name={u.name} />
                  <span>
                    {u.name}
                    {u.id === currentUserId ? (
                      <span className="ml-s5 text-body-sm text-ink-muted">(vos)</span>
                    ) : null}
                  </span>
                </span>
              </th>
              <td className="px-s20 py-s10 text-ink-muted">{u.email}</td>
              <td className="px-s20 py-s10">
                <Tag>{ROLE_LABEL[u.role]}</Tag>
              </td>
              <td className="px-s20 py-s10">
                <StatusBadge tone={u.active ? 'success' : 'warning'}>
                  {u.active ? 'Activo' : 'Inactivo'}
                </StatusBadge>
              </td>
              <td className="px-s20 py-s10">
                <UserRowActions user={u} isSelf={u.id === currentUserId} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
