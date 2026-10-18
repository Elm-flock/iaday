import NextLink from 'next/link';
import { cn } from '@/lib/cn';
import { STATUS_LABEL } from '../../../pedidos-adaptacion/messages';
import type { AdaptationStatus } from '@/lib/dal/adaptation-requests';

export type RequestFilter = { status?: AdaptationStatus; overdue?: boolean };

const STATUSES = Object.keys(STATUS_LABEL) as AdaptationStatus[];

/** Query string del filtro: `?estado=PENDIENTE` o `?vencidos=1` (sin JS). */
export function requestsHref(filter: RequestFilter, page = 1): string {
  const query = new URLSearchParams();
  if (filter.status) query.set('estado', filter.status);
  if (filter.overdue) query.set('vencidos', '1');
  if (page > 1) query.set('pagina', String(page));
  const qs = query.toString();
  return qs ? `/admin/pedidos-adaptacion?${qs}` : '/admin/pedidos-adaptacion';
}

/** Filtros como enlaces con el actual marcado (`aria-current`). */
export function RequestsFilter({ current }: { current: RequestFilter }) {
  const options: { label: string; filter: RequestFilter }[] = [
    { label: 'Todos', filter: {} },
    ...STATUSES.map((s) => ({ label: STATUS_LABEL[s], filter: { status: s } })),
    { label: 'Vencidos', filter: { overdue: true } },
  ];
  const isCurrent = (f: RequestFilter) =>
    f.status === current.status && Boolean(f.overdue) === Boolean(current.overdue);
  return (
    <nav aria-label="Filtrar pedidos" className="flex flex-wrap items-center gap-s10">
      {options.map(({ label, filter }) => {
        const active = isCurrent(filter);
        return (
          <NextLink
            key={label}
            href={requestsHref(filter)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex h-8 items-center rounded-pill border px-s15 text-button-sm transition-colors duration-150 ease-out',
              active
                ? 'border-primary bg-primary text-on-primary'
                : 'border-border-strong text-ink hover:bg-surface-subtle',
            )}
          >
            {label}
          </NextLink>
        );
      })}
    </nav>
  );
}
