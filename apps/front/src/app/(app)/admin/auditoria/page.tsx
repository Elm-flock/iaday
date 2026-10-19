import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ACTIONS, dayEndIso, dayStartIso, isAuditAction, parseDay } from './audit-diff';
import { AuditFilters, type AuditFilterValues } from './_components/audit-filters';
import { AuditPagination } from './_components/audit-pagination';
import { AuditTable } from './_components/audit-table';
import { PageSkeleton } from '../../_components/page-skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { listAudit } from '@/lib/dal/audit';
import { getCurrentUser } from '@/lib/dal/session';
import { listUsers } from '@/lib/dal/users';

export const metadata: Metadata = { title: 'Auditoría' };

type Param = string | string[] | undefined;
type SearchParams = Promise<{
  accion?: Param;
  entidad?: Param;
  persona?: Param;
  desde?: Param;
  hasta?: Param;
  pagina?: Param;
}>;

const first = (value: Param): string | undefined => (Array.isArray(value) ? value[0] : value);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function AuditContent({ searchParams }: { searchParams: SearchParams }) {
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  // Solo administración: el resto recibe 404 (no se revela que la sección existe). El back vuelve a
  // exigir ADMIN en cada pedido.
  if (user.role !== 'ADMIN') notFound();

  const accion = first(params.accion);
  const persona = first(params.persona);
  const values: AuditFilterValues = {
    action: isAuditAction(accion) ? accion : undefined,
    entityType: first(params.entidad) || undefined,
    actorId: persona && UUID.test(persona) ? persona : undefined,
    from: parseDay(first(params.desde)),
    to: parseDay(first(params.hasta)),
  };
  const requestedPage = Number(first(params.pagina));
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const [audit, users] = await Promise.all([
    listAudit({
      action: values.action,
      entityType: values.entityType,
      actorId: values.actorId,
      from: values.from ? dayStartIso(values.from) : undefined,
      to: values.to ? dayEndIso(values.to) : undefined,
      page,
    }),
    listUsers(),
  ]);
  const people = new Map(users.map((u) => [u.id, u.name]));

  return (
    <>
      <PageHeader
        title="Auditoría"
        description="Quién hizo qué y cuándo con los datos importantes: publicaciones, metas, roles, ciclos e IA. Es solo de lectura y no se puede borrar. Nunca muestra el contenido de un feedback."
      />
      <div className="flex flex-col gap-s20">
        <AuditFilters
          values={values}
          people={users.map((u) => ({ id: u.id, name: u.name }))}
          actions={ACTIONS}
        />
        <AuditTable items={audit.items} people={people} />
        <AuditPagination
          page={audit.page}
          limit={audit.limit}
          total={audit.total}
          values={values}
        />
      </div>
    </>
  );
}

export default function AuditoriaPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AuditContent searchParams={searchParams} />
    </Suspense>
  );
}
