// Fuera de actions.ts: un archivo 'use server' solo puede exportar funciones async.
export const LOGIN_MESSAGES = {
  empty: 'Completá el email y la contraseña para ingresar.',
  invalid: 'No pudimos iniciar sesión. Revisá el email y la contraseña.',
  throttled: 'Hiciste demasiados intentos. Esperá un minuto y probá de nuevo.',
  unavailable: 'No pudimos conectarnos con el servidor. Probá de nuevo en unos minutos.',
} as const;
