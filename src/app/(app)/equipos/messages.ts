import type { ErrorCopy } from '@/lib/api/error-copy';

// Fuera de actions.ts: un archivo 'use server' solo puede exportar funciones async.

/** Alta/edición de equipos. 409: nombre repetido bajo el mismo padre o movimiento que crearía un ciclo. */
export const TEAM_ERROR_COPY: ErrorCopy = {
  statuses: {
    404: 'No encontramos el equipo (o el equipo padre). Puede que ya no exista: volvé a la lista de equipos.',
    409: 'Ya existe un equipo con ese nombre dentro del mismo equipo padre, o el cambio dejaría a un equipo debajo de sí mismo. Cambiá el nombre o el equipo padre.',
  },
};

/** Integrantes. */
export const MEMBER_ERROR_COPY: ErrorCopy = {
  statuses: {
    404: 'No encontramos al usuario o al equipo. Recargá la página y probá de nuevo.',
    409: 'Esa persona ya cambió en este equipo. Recargá la página para ver el estado actual.',
  },
};
