import type { Metadata } from 'next';
import NextLink from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { RequestsFilter, requestsHref, type RequestFilter } from './_components/requests-filter';
import { RequestsTable } from './_components/requests-table';
import { PageSkeleton } from '../../_components/page-skeleton';
import { STATUS_LABEL } from '../../pedidos-adaptacion/messages';
import { buttonStyles } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { formatNumber } from '@/lib/format';
import { listAllAdaptationRequests, type AdaptationStatus } from '@/lib/dal/adaptation-requests';
import { cn } from '@/lib/cn';
import { getCurrentUser } from '@/lib/dal/session';
import { listUsers } from '@/lib/dal/users';

export const metadata: Metadata = { title: 'Pedidos de adaptación' };

type Param = string | string[] | undefined;
type SearchParams = Promise<{ estado?: Param; vencidos?: Param; pagina?: Param }>;
const first = (value: Param) => (Array.isArray(value) ? value[0] : value);
const isStatus = (value: unknown): value is AdaptationStatus =>
  typeof value === 'string' && value in STATUS_LABEL;

async function RequestsContent({ searchParams }: { searchParams: SearchParams }) {
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  // Solo administración: el resto recibe 404 (no se revela que la sección existe). El back vuelve a
  // exigir ADMIN en cada pedido.
  if (user.role !== 'ADMIN') notFound();

  const estado = first(params.estado);
  const filter: RequestFilter = {
    status: isStatus(estado) ? estado : undefined,
    overdue: first(params.vencidos) === '1' ? true : undefined,
  };
  const requested = Number(first(params.pagina));
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;

  const [list, users] = await Promise.all([
    listAllAdaptationRequests({ ...filter, page }),
    listUsers(),
  ]);
  const admins = users
    .filter((u) => u.role === 'ADMIN' && u.active)
    .map((u) => ({
      id: u.id,
      name: u.name,
    }));
  const pages = Math.max(1, Math.ceil(list.total / list.limit));
  const disabled = 'pointer-events-none opacity-40';

  return (
    <>
      <PageHeader
        title="Pedidos de adaptación"
        description="Personas que piden un documento en otro formato (art. 14.5 del RD 707/2026). Hay que responder antes de la fecha límite; si se rechaza, la justificación es obligatoria y la lee quien lo pidió."
      />
      <div className="flex flex-col gap-s20">
        <RequestsFilter current={filter} />
        <RequestsTable items={list.items} admins={admins} currentUserId={user.id} />
        <nav
          aria-label="Páginas de pedidos"
          className="flex flex-wrap items-center justify-between gap-s10"
        >
          <p className="text-body-sm text-ink-muted">
            {list.total === 0
              ? 'Sin pedidos'
              : `${formatNumber(list.total, 0)} pedidos · Página ${list.page} de ${pages}`}
          </p>
          <div className="flex items-center gap-s10">
            <NextLink
              href={requestsHref(filter, Math.max(1, page - 1))}
              aria-disabled={page <= 1 ? true : undefined}
              tabIndex={page <= 1 ? -1 : undefined}
              className={cn(
                buttonStyles({ variant: 'secondary', size: 'sm' }),
                page <= 1 && disabled,
              )}
            >
              Anterior
            </NextLink>
            <NextLink
              href={requestsHref(filter, Math.min(pages, page + 1))}
              aria-disabled={page >= pages ? true : undefined}
              tabIndex={page >= pages ? -1 : undefined}
              className={cn(
                buttonStyles({ variant: 'secondary', size: 'sm' }),
                page >= pages && disabled,
              )}
            >
              Siguiente
            </NextLink>
          </div>
        </nav>
      </div>
    </>
  );
}

export default function PedidosAdaptacionAdminPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RequestsContent searchParams={searchParams} />
    </Suspense>
  );
}
