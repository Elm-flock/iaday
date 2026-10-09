/** Copy de errores de la API en es-AR: qué pasó + cómo seguir. Sin `server-only`: lo prueban los tests y lo usan las actions. */

export type ApiFailure = { status: number; body?: unknown };

export type ErrorCopy = {
  /** Mensajes por código de dominio del back (`body.code`), p. ej. QUARTER_OVERLAPS_SIBLING. */
  codes?: Record<string, string>;
  /** Mensajes por status HTTP, para un módulo concreto. */
  statuses?: Partial<Record<number, string>>;
};

export const GENERIC_ERRORS = {
  forbidden:
    'No tenés permisos para hacer esto. Pedile a alguien de administración que lo haga por vos.',
  notFound:
    'No encontramos lo que buscabas. Puede que ya no exista: recargá la página y probá de nuevo.',
  invalid: 'Hay datos que no son válidos. Revisá el formulario y probá de nuevo.',
  conflict: 'Otra persona cambió esto antes que vos. Recargá la página y volvé a intentar.',
  unprocessable:
    'No pudimos completar la acción con el estado actual. Revisá los datos y probá de nuevo.',
  server: 'Algo salió mal de nuestro lado. Probá de nuevo en unos minutos.',
  unavailable: 'No pudimos conectarnos con el servidor. Probá de nuevo en unos minutos.',
} as const;

/** `body.code` si el back lo informa (errores de dominio). */
export function apiErrorCode(body: unknown): string | undefined {
  const code = (body as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
}

export function failureMessage(failure: ApiFailure, copy: ErrorCopy = {}): string {
  const code = apiErrorCode(failure.body);
  if (code && copy.codes?.[code]) return copy.codes[code];
  const byStatus = copy.statuses?.[failure.status];
  if (byStatus) return byStatus;

  switch (failure.status) {
    case 0:
      return GENERIC_ERRORS.unavailable;
    case 400:
      return GENERIC_ERRORS.invalid;
    case 403:
      return GENERIC_ERRORS.forbidden;
    case 404:
      return GENERIC_ERRORS.notFound;
    case 409:
      return GENERIC_ERRORS.conflict;
    case 422:
      return GENERIC_ERRORS.unprocessable;
    default:
      return GENERIC_ERRORS.server;
  }
}
