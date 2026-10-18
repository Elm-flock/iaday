import { apiErrorCode, type ApiFailure } from '@/lib/api/error-copy';

// Fuera de actions.ts: un archivo 'use server' solo puede exportar funciones async.

export const MAX_MESSAGE_LENGTH = 2000;

export type AssistantContext = 'send' | 'confirm' | 'discard' | 'clear' | 'digest';

/** Qué le pasó a la acción, para que la UI decida cómo mostrarlo (nota no bloqueante vs. alerta). */
export type AssistantFailureKind =
  | 'unavailable'
  | 'rejected'
  | 'throttled'
  | 'expired'
  | 'hash-mismatch'
  | 'already-decided'
  | 'invalid'
  | 'not-found'
  | 'generic';

export type AssistantFailure = { kind: AssistantFailureKind; message: string };

export const ASSISTANT_COPY = {
  unavailable:
    'El asistente no está disponible en este momento. El resto de la plataforma funciona con normalidad: podés hacer lo mismo desde las pantallas de siempre, o probar de nuevo en unos minutos.',
  rejected:
    'No pudimos procesar ese mensaje. Reescribilo sin datos sensibles (contraseñas, documentos, datos personales de terceros) y probá de nuevo. Tu texto sigue en el cuadro.',
  throttled: 'Hiciste muchos pedidos seguidos. Esperá un minuto y probá de nuevo.',
  expired:
    'El plan venció (duran 15 minutos) y no se ejecutó nada. Pedilo de nuevo para generar uno nuevo.',
  hashMismatch:
    'El plan cambió desde que lo viste, así que no se ejecutó nada. Pedilo de nuevo y revisalo antes de confirmar.',
  alreadyDecided: 'Este plan ya se había confirmado, ejecutado o descartado. Mostramos cómo quedó.',
  invalid: 'Este plan tiene problemas y no se puede ejecutar. Pedilo de nuevo con más detalle.',
  notFound: 'No encontramos ese plan. Puede que ya no exista: recargá la página.',
  generic: 'Algo salió mal de nuestro lado. Probá de nuevo en unos minutos.',
  network: 'No pudimos conectarnos con el servidor. Probá de nuevo en unos minutos.',
  tooLong: `El mensaje puede tener hasta ${MAX_MESSAGE_LENGTH} caracteres.`,
  empty: 'Escribí qué necesitás antes de enviar.',
} as const;

/** Error de la API Nest → copy es-AR + tipo. Puro: lo prueban los tests. */
export function assistantFailure(
  failure: ApiFailure,
  context: AssistantContext = 'send',
): AssistantFailure {
  const code = apiErrorCode(failure.body);
  switch (code) {
    case 'AI_UNAVAILABLE':
    case 'AI_DISABLED':
      return { kind: 'unavailable', message: ASSISTANT_COPY.unavailable };
    case 'AI_INPUT_REJECTED':
      return { kind: 'rejected', message: ASSISTANT_COPY.rejected };
    case 'ASSISTANT_PLAN_EXPIRED':
      return { kind: 'expired', message: ASSISTANT_COPY.expired };
    case 'ASSISTANT_PLAN_HASH_MISMATCH':
      return { kind: 'hash-mismatch', message: ASSISTANT_COPY.hashMismatch };
    case 'ASSISTANT_PLAN_ALREADY_DECIDED':
      return { kind: 'already-decided', message: ASSISTANT_COPY.alreadyDecided };
    case 'ASSISTANT_PLAN_INVALID':
      return { kind: 'invalid', message: ASSISTANT_COPY.invalid };
    case 'ASSISTANT_PLAN_NOT_FOUND':
      return { kind: 'not-found', message: ASSISTANT_COPY.notFound };
    default:
  }
  switch (failure.status) {
    case 0:
      return { kind: 'unavailable', message: ASSISTANT_COPY.network };
    case 404:
      return { kind: 'not-found', message: ASSISTANT_COPY.notFound };
    case 429:
      return { kind: 'throttled', message: ASSISTANT_COPY.throttled };
    case 502:
    case 503:
      return { kind: 'unavailable', message: ASSISTANT_COPY.unavailable };
    case 422:
      return context === 'send'
        ? { kind: 'rejected', message: ASSISTANT_COPY.rejected }
        : { kind: 'invalid', message: ASSISTANT_COPY.invalid };
    default:
      return { kind: 'generic', message: ASSISTANT_COPY.generic };
  }
}

/** Título corto por código de problema de un plan; el detalle es el mensaje del back. */
export const ISSUE_TITLE: Record<string, string> = {
  UNKNOWN_ACTION: 'Acción que el asistente no puede hacer',
  UNGROUNDED: 'No quedó claro que lo hayas pedido',
  EMAIL_TAKEN: 'Ese email ya existe',
  TEAM_NAME_TAKEN: 'Ya hay un equipo con ese nombre',
  OBJECTIVE_LIMIT: 'Límite de objetivos',
  KR_LIMIT: 'Límite de resultados clave',
  UNKNOWN_HANDLE: 'Referencia desconocida',
  UNKNOWN_REF: 'Referencia desconocida',
  DUPLICATE_REF: 'Referencia repetida',
  TOO_MANY_ACTIONS: 'Demasiadas acciones en un plan',
  PARENT_NOT_PUBLISHED: 'El objetivo padre no está publicado',
  CYCLE_NOT_EDITABLE: 'El ciclo ya no se puede editar',
  DTO_INVALID: 'Datos inválidos',
  CREATES_ADMIN: 'Crea una persona con acceso de administración',
  REMOVES_MEMBER: 'Quita a una persona de un equipo',
  ACTIVATES_CYCLE: 'Activa un ciclo',
  WILL_NOT_BE_PUBLISHABLE: 'El objetivo no se va a poder publicar todavía',
  CATALOG_TRUNCATED: 'El asistente no vio todos los datos',
};

export const PLAN_STATUS_LABEL: Record<string, string> = {
  PROPOSED: 'Esperando tu confirmación',
  INVALID: 'No se puede ejecutar',
  EXECUTING: 'Ejecutándose',
  EXECUTED: 'Ejecutado',
  PARTIAL: 'Ejecutado en parte',
  FAILED: 'No se pudo ejecutar',
  INTERRUPTED: 'Interrumpido',
  DISCARDED: 'Descartado',
  EXPIRED: 'Venció',
};

export const EXECUTION_HEADLINE: Record<'EXECUTED' | 'PARTIAL' | 'FAILED', string> = {
  EXECUTED: 'Se hizo todo lo del plan',
  PARTIAL: 'Se hizo solo una parte del plan',
  FAILED: 'No se pudo hacer lo del plan',
};

export const STEP_STATUS: Record<'OK' | 'FAILED' | 'SKIPPED', string> = {
  OK: 'Hecho',
  FAILED: 'Falló',
  SKIPPED: 'No se hizo',
};

/** Solo rutas internas de la app: nunca un enlace del back a otro origen. */
export function internalHref(url: string | null | undefined): string | null {
  if (!url || !url.startsWith('/') || url.startsWith('//') || url.includes('\\')) return null;
  return url;
}
