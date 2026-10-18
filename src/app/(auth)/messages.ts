import type { ErrorCopy } from '@/lib/api/error-copy';

// Fuera de actions.ts: un archivo 'use server' solo puede exportar funciones async.
export const LOGIN_MESSAGES = {
  empty: 'Completá el email y la contraseña para ingresar.',
  invalid: 'No pudimos iniciar sesión. Revisá el email y la contraseña.',
  throttled: 'Hiciste demasiados intentos. Esperá un minuto y probá de nuevo.',
  unavailable: 'No pudimos conectarnos con el servidor. Probá de nuevo en unos minutos.',
} as const;

export const CHANGE_PASSWORD_COPY: ErrorCopy = {
  codes: {
    INVALID_CURRENT_PASSWORD:
      'La contraseña actual no es correcta. Revisala (si recién te dieron acceso, es la que te pasó administración).',
    PASSWORD_UNCHANGED: 'La contraseña nueva tiene que ser distinta de la actual.',
    PASSWORD_TOO_SHORT: 'La contraseña nueva tiene que tener al menos 12 caracteres.',
  },
  statuses: {
    400: 'La contraseña nueva tiene que tener entre 12 y 200 caracteres.',
    429: 'Hiciste demasiados intentos. Esperá un minuto y probá de nuevo.',
  },
};
