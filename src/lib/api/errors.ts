/** Error de la API Nest (cualquier status distinto de 2xx que no sea 401 en sesión). */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body?: unknown) {
    super(`API respondió ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/** Mensaje del back (class-validator/Nest) si viene en el body, sin exponer nada más. */
export function apiErrorMessage(error: ApiError): string | undefined {
  const message = (error.body as { message?: unknown } | undefined)?.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.filter((m) => typeof m === 'string').join('. ');
  return undefined;
}

/** Devuelve `data` o lanza ApiError. El 401 ya lo resolvió el cliente autenticado (redirect). */
export function unwrap<T>(result: {
  data?: T;
  error?: unknown;
  response: Response;
}): NonNullable<T> {
  if (result.data === undefined || result.data === null) {
    throw new ApiError(result.response.status, result.error);
  }
  return result.data as NonNullable<T>;
}
