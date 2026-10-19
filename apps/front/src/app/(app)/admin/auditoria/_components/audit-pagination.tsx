import Link from 'next/link';
import type { AuditFilterValues } from './audit-filters';
import { buttonStyles } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

/** Query string con los filtros activos y la página pedida (claves de la URL en español). */
export function auditHref(values: AuditFilterValues, page: number): string {
  const query = new URLSearchParams();
  if (values.action) query.set('accion', values.action);
  if (values.entityType) query.set('entidad', values.entityType);
  if (values.actorId) query.set('persona', values.actorId);
  if (values.from) query.set('desde', values.from);
  if (values.to) query.set('hasta', values.to);
  if (page > 1) query.set('pagina', String(page));
  const qs = query.toString();
  return qs ? `/admin/auditoria?${qs}` : '/admin/auditoria';
}

/** Anterior / siguiente como enlaces (sin JS), con el rango visible en texto. */
export function AuditPagination({
  page,
  limit,
  total,
  values,
}: {
  page: number;
  limit: number;
  total: number;
  values: AuditFilterValues;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  const disabled = 'pointer-events-none opacity-40';
  return (
    <nav
      aria-label="Páginas del registro"
      className="flex flex-wrap items-center justify-between gap-s10"
    >
      <p className="text-body-sm text-ink-muted">
        {total === 0
          ? 'Sin registros'
          : `Mostrando ${formatNumber(from, 0)} a ${formatNumber(to, 0)} de ${formatNumber(total, 0)} · Página ${page} de ${pages}`}
      </p>
      <div className="flex items-center gap-s10">
        <Link
          href={auditHref(values, Math.max(1, page - 1))}
          aria-disabled={page <= 1 ? true : undefined}
          tabIndex={page <= 1 ? -1 : undefined}
          rel="prev"
          className={cn(buttonStyles({ variant: 'secondary', size: 'sm' }), page <= 1 && disabled)}
        >
          Anterior
        </Link>
        <Link
          href={auditHref(values, Math.min(pages, page + 1))}
          aria-disabled={page >= pages ? true : undefined}
          tabIndex={page >= pages ? -1 : undefined}
          rel="next"
          className={cn(
            buttonStyles({ variant: 'secondary', size: 'sm' }),
            page >= pages && disabled,
          )}
        >
          Siguiente
        </Link>
      </div>
    </nav>
  );
}
