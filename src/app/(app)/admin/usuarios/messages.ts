import type { ErrorCopy } from '@/lib/api/error-copy';

// Fuera de actions.ts: un archivo 'use server' solo puede exportar funciones async.

export const USER_ERROR_COPY: ErrorCopy = {
  statuses: {
    400: 'Hay datos que no son válidos. Revisá el email y que la contraseña tenga entre 8 y 200 caracteres.',
    404: 'No encontramos a la persona. Puede que ya no exista: recargá la lista de usuarios.',
    409: 'Ya existe un usuario con ese email. Usá otro email o editá a la persona existente.',
    422: 'No podés cambiar tu propio rol ni desactivarte. Pedile a otra persona de administración que lo haga.',
  },
};

export const ROLE_LABEL = {
  ADMIN: 'Administración',
  LEADER: 'Liderazgo',
  MEMBER: 'Integrante',
} as const;
