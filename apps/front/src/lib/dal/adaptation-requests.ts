import 'server-only';
import { connection } from 'next/server';
import { authedApi } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';
import type { components } from '@/lib/api/schema';

export type AdaptationRequest = components['schemas']['AdaptationRequestDto'];
export type AdaptationRequestPage = components['schemas']['AdaptationRequestPageDto'];
export type AdaptationStatus = AdaptationRequest['status'];
export type AdaptationFormat = AdaptationRequest['preferredFormat'];

export const ADAPTATION_PAGE_SIZE = 20;

/*
 * Sin cache de Next: el asunto y el detalle de un pedido son texto libre de una persona (pueden
 * contar una necesidad de accesibilidad). Son lecturas dinámicas por request y nunca se etiquetan.
 */

/** Mis pedidos, del más nuevo al más viejo. */
export async function listMyAdaptationRequests(page = 1): Promise<AdaptationRequestPage> {
  await connection();
  const client = await authedApi();
  return unwrap(
    await client.GET('/adaptation-requests/mine', {
      params: { query: { page, limit: ADAPTATION_PAGE_SIZE } },
    }),
  );
}

export type AdminRequestFilters = {
  status?: AdaptationStatus;
  overdue?: boolean;
  page?: number;
};

/** Todos los pedidos (solo ADMIN: el back responde 403 al resto). */
export async function listAllAdaptationRequests(
  filters: AdminRequestFilters = {},
): Promise<AdaptationRequestPage> {
  await connection();
  const client = await authedApi();
  return unwrap(
    await client.GET('/adaptation-requests', {
      params: {
        query: {
          status: filters.status,
          overdue: filters.overdue,
          page: filters.page ?? 1,
          limit: ADAPTATION_PAGE_SIZE,
        },
      },
    }),
  );
}
