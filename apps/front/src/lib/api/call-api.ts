import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import type { ApiFailure } from './error-copy';

type FetchResult<T> = { data?: T; error?: unknown; response: Response };

export type CallResult<T> = { ok: true; data: T | undefined } | { ok: false; failure: ApiFailure };

/**
 * Ejecuta una mutación contra la API desde una Server Action y normaliza el resultado.
 * - Respuesta no 2xx → `{ok:false, failure:{status, body}}` (el 401 ya redirigió en el cliente).
 * - Caída de red → `status: 0`.
 * - Los errores internos de Next (redirect/notFound) se vuelven a lanzar: no se deben tragar.
 */
export async function callApi<T>(fn: () => Promise<FetchResult<T>>): Promise<CallResult<T>> {
  try {
    const result = await fn();
    if (result.response.ok) return { ok: true, data: result.data };
    return { ok: false, failure: { status: result.response.status, body: result.error } };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, failure: { status: 0 } };
  }
}
