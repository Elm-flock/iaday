import { apiErrorCode, failureMessage, type ApiFailure } from '@/lib/api/error-copy';

// Fuera de actions.ts: un archivo 'use server' solo puede exportar funciones async.

export type AiContext = 'adapt' | 'suggest' | 'summary' | 'decide' | 'admin';

export const AI_UNAVAILABLE_COPY =
  'La ayuda de IA no está disponible ahora. El resto de la plataforma funciona normal.';
export const AI_RATE_LIMITED_COPY = 'Hiciste muchos pedidos seguidos. Probá en un minuto.';

/** Códigos de dominio de `ai.errors.ts` del back -> copy es-AR (qué pasó + cómo seguir). Cubre TODOS. */
export const AI_CODE_COPY: Record<string, string> = {
  AI_DISABLED: AI_UNAVAILABLE_COPY,
  AI_UNAVAILABLE: AI_UNAVAILABLE_COPY,
  AI_RATE_LIMITED: AI_RATE_LIMITED_COPY,
  AI_INPUT_REJECTED: 'No pudimos adaptar este texto. Podés seguir leyendo el original.',
  AI_OUTPUT_INVALID:
    'La IA devolvió una respuesta que no pudimos usar. Probá de nuevo en unos minutos.',
  AI_NOTHING_TO_ADAPT: 'No hay texto para adaptar en este elemento.',
  AI_NOTHING_TO_SUMMARIZE: 'Todavía no hay check-ins para resumir.',
  AI_ADAPTATION_NOT_FOUND: 'Todavía no hay una versión accesible de este texto.',
  AI_ADAPTATION_STATE_CONFLICT:
    'Esta versión ya cambió de estado (por ejemplo, ya fue validada). Recargá la página para ver el estado actual.',
  AI_SUGGESTION_ALREADY_DECIDED: 'Ya decidiste sobre esta sugerencia.',
  AI_VALIDATION_NOT_ALLOWED:
    'El feedback es privado: no tiene validación externa. Solo podés marcar que la versión te sirve.',
  AI_EDITED_CONTENT_INVALID:
    'La corrección tiene que mantener los mismos bloques de texto, en el mismo orden. Revisá y probá de nuevo.',
};

const CONTEXT_OVERRIDES: Partial<Record<AiContext, Record<string, string>>> = {
  suggest: { AI_INPUT_REJECTED: 'No pudimos mejorar este texto. Probá reescribiéndolo.' },
  summary: { AI_INPUT_REJECTED: 'No pudimos resumir estos check-ins.' },
};

/**
 * Mensaje es-AR para un fallo de la API de IA. El 429 del throttler llega sin código de dominio, y un
 * 503 sin código también significa "IA no disponible": ambos se resuelven por status.
 */
export function aiFailureMessage(failure: ApiFailure, context: AiContext = 'adapt'): string {
  const code = apiErrorCode(failure.body);
  const override = code ? CONTEXT_OVERRIDES[context]?.[code] : undefined;
  if (override) return override;
  return failureMessage(failure, {
    codes: AI_CODE_COPY,
    statuses: {
      0: AI_UNAVAILABLE_COPY,
      403: 'No tenés permiso para hacer esto.',
      404: 'No encontramos lo que buscabas. Puede que ya no exista: recargá la página.',
      429: AI_RATE_LIMITED_COPY,
      502: AI_CODE_COPY.AI_OUTPUT_INVALID,
      503: AI_UNAVAILABLE_COPY,
    },
  });
}

/** `true` si el fallo significa "la IA no está disponible" (se muestra como nota no bloqueante). */
export function isAiUnavailable(failure: ApiFailure): boolean {
  const code = apiErrorCode(failure.body);
  if (code) return code === 'AI_DISABLED' || code === 'AI_UNAVAILABLE';
  return failure.status === 0 || failure.status === 503;
}

export const ADAPTATION_LEVEL_LABEL = {
  EASY_READ: 'Lectura fácil',
  PLAIN: 'Lenguaje claro',
} as const;

export const AI_STATUS_LABEL = {
  DRAFT: 'Generado por IA · pendiente de validación',
  ACCEPTED: 'Generado por IA · pendiente de validación',
  VALIDATED: 'Validado por una persona',
  NEEDS_REVIEW: 'Requiere revisión humana',
} as const;

export const REVIEW_NOTICE =
  'No pudimos garantizar que la versión adaptada sea fiel al original, así que te mostramos el texto original. Una persona debería revisarlo.';

export const TREND_LABEL = {
  IMPROVING: 'Mejorando',
  STABLE: 'Estable',
  DECLINING: 'Empeorando',
  INSUFFICIENT_DATA: 'Pocos datos',
} as const;

export const VALIDATE_DISABLED_FEEDBACK =
  'El feedback es privado: solo vos y la otra persona pueden verlo, así que no tiene validación externa.';
export const VALIDATE_DISABLED_PERMISSION =
  'Solo administración o el líder del equipo puede validar esta versión.';

/** Ayuda: diferencia entre lectura fácil y lenguaje claro (ancla del manual de usuario; la verifica ayuda/help-data.test.ts). */
export const HELP_EASY_READ_HREF =
  '/ayuda/usuario#qué-diferencia-hay-entre-lectura-fácil-y-lenguaje-claro';
