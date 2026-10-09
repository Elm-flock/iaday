import type { ErrorCopy } from '@/lib/api/error-copy';

// Fuera de actions.ts: un archivo 'use server' solo puede exportar funciones async.

export const NOTE_MAX = 2000;

export type CheckInActionKind = 'CONTINUE' | 'UPDATE' | 'START' | 'STOP';

/** Acciones del check-in con una explicación corta de cuándo usarlas. */
export const CHECK_IN_ACTIONS: { value: CheckInActionKind; label: string; help: string }[] = [
  { value: 'CONTINUE', label: 'Continuar', help: 'Seguimos igual: lo que hacemos funciona.' },
  { value: 'UPDATE', label: 'Actualizar', help: 'Cambió el valor y quiero reflejarlo.' },
  { value: 'START', label: 'Iniciar', help: 'Voy a empezar algo nuevo para avanzar.' },
  { value: 'STOP', label: 'Detener', help: 'Voy a dejar de hacer algo que no suma.' },
];

export const CHECK_IN_ACTION_LABEL: Record<CheckInActionKind, string> = {
  CONTINUE: 'Continuar',
  UPDATE: 'Actualizar',
  START: 'Iniciar',
  STOP: 'Detener',
};

export const CHECK_IN_FORBIDDEN_REASON =
  'Solo quien ejecuta el resultado clave o su líder puede registrar avances.';
export const CHECK_IN_DRAFT_REASON = 'Publicá el objetivo para poder registrar check-ins.';
export const CHECK_IN_CLOSED_REASON =
  'El objetivo está cerrado: ya no se pueden registrar check-ins.';

/** Códigos de dominio del back -> copy es-AR (qué pasó + cómo seguir). */
export const CHECK_IN_CODE_COPY: Record<string, string> = {
  OBJECTIVE_NOT_PUBLISHED:
    'El objetivo todavía es un borrador. Publicalo y después registrá el check-in.',
  OBJECTIVE_CLOSED:
    'El objetivo ya está cerrado y no admite check-ins. Si seguís trabajando en esto, creá un objetivo en un ciclo abierto.',
  CYCLE_CLOSED: 'El ciclo ya está cerrado, así que no se pueden registrar check-ins.',
  CHECKIN_VALUE_REQUIRED: 'Ingresá el valor actual del resultado clave y probá de nuevo.',
  CHECKIN_VALUE_NOT_ALLOWED:
    'Este resultado clave es manual: elegí un puntaje entre 0,0 y 1,0 en vez de un valor.',
  CHECKIN_MANUAL_SCORE_REQUIRED: 'Elegí un puntaje entre 0,0 y 1,0 y probá de nuevo.',
  CHECKIN_MANUAL_SCORE_NOT_ALLOWED:
    'Este resultado clave es numérico: ingresá el valor actual en vez de un puntaje.',
  INVALID_MANUAL_SCORE: 'El puntaje va de 0,0 a 1,0 en pasos de 0,1. Elegí uno de la lista.',
  KR_VALUES_REQUIRED:
    'El resultado clave no tiene inicio y meta definidos. Pedile a quien lo lidera que los complete.',
};

export const CHECK_IN_ERROR_COPY: ErrorCopy = {
  codes: CHECK_IN_CODE_COPY,
  statuses: {
    403: 'No podés registrar check-ins en este resultado clave. Solo quien lo ejecuta, el responsable del objetivo, su equipo o el líder pueden hacerlo.',
    404: 'No encontramos el resultado clave. Puede que ya no exista: recargá la página.',
  },
};
