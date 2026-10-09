import createClient from 'openapi-fetch';
import type { paths } from './schema';

/** URL base de la API Nest. Solo server (sin NEXT_PUBLIC): el browser nunca llama al back. */
export function apiBaseUrl(): string {
  return process.env.API_URL ?? 'http://localhost:3000';
}

type Options = { token?: string };

/** Cliente tipado desde el OpenAPI del back. Sin `server-only` para que lo use también el proxy. */
export function createApiClient({ token }: Options = {}) {
  return createClient<paths>({
    baseUrl: apiBaseUrl(),
    // Sin caché de fetch: la caché vive en 'use cache: private' del DAL.
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}
