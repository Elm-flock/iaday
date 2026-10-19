import 'server-only';
import { connection } from 'next/server';
import { authedApi } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';
import type { components } from '@/lib/api/schema';

export type AuditEntry = components['schemas']['AuditEntryDto'];
export type AuditPage = components['schemas']['AuditPageDto'];
export type AuditAction = AuditEntry['action'];

export type AuditFilters = {
  action?: AuditAction;
  entityType?: string;
  actorId?: string;
  /** ISO 8601, inclusive. */
  from?: string;
  /** ISO 8601, inclusive. */
  to?: string;
  page?: number;
};

export const AUDIT_PAGE_SIZE = 20;

/*
 * Sin cache de Next: el registro de auditoría se consulta en cada request (solo ADMIN; el back
 * vuelve a exigirlo). El AuditLog nunca contiene contenido de feedback; aun así la pantalla muestra
 * solo campos de una lista permitida (ver `audit-diff.ts`).
 */

/** Una página del registro, del más nuevo al más viejo. */
export async function listAudit(filters: AuditFilters = {}): Promise<AuditPage> {
  await connection();
  const client = await authedApi();
  return unwrap(
    await client.GET('/audit', {
      params: {
        query: {
          action: filters.action,
          entityType: filters.entityType,
          actorId: filters.actorId,
          from: filters.from,
          to: filters.to,
          page: filters.page ?? 1,
          limit: AUDIT_PAGE_SIZE,
        },
      },
    }),
  );
}
