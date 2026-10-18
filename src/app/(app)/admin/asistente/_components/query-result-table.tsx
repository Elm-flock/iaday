import { internalHref } from '../messages';
import { ACTION_LABEL, entityLabel, formatWhen } from '../../auditoria/audit-diff';
import { Link } from '@/components/ui/link';
import type { components } from '@/lib/api/schema';
import { formatDate } from '@/lib/format';

type Query = components['schemas']['QueryResultDto'];

const th = 'px-s10 py-s10 font-normal';
const td = 'px-s10 py-s10 align-top';

const actionLabel = (action: string): string =>
  (ACTION_LABEL as Record<string, string>)[action] ?? action;

/**
 * Resultado de una consulta de solo lectura. Las filas las arma el back (Nest): el asistente de IA
 * solo eligió los filtros, nunca produjo estos datos.
 */
export function QueryResultTable({ query }: { query: Query }) {
  const link = internalHref(query.link);
  const hasAudit = query.type === 'AUDIT_SEARCH' && query.auditRows.length > 0;
  const hasRequests = query.type === 'ADAPTATION_REQUESTS_LIST' && query.requestRows.length > 0;

  return (
    <div className="flex flex-col gap-s10" data-testid="query-result">
      <p className="text-body text-ink">{query.summary}</p>
      {hasAudit ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[40rem] text-left text-body-sm">
            <caption className="sr-only">Resultado de la consulta de auditoría</caption>
            <thead>
              <tr className="border-b border-border text-ink-muted">
                <th scope="col" className={th}>
                  Fecha
                </th>
                <th scope="col" className={th}>
                  Quién
                </th>
                <th scope="col" className={th}>
                  Acción
                </th>
                <th scope="col" className={th}>
                  Elemento
                </th>
                <th scope="col" className={th}>
                  Cambio
                </th>
              </tr>
            </thead>
            <tbody>
              {query.auditRows.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-b-0">
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{formatWhen(row.at)}</td>
                  <td className={td}>{row.actorName ?? 'Sistema'}</td>
                  <td className={td}>{actionLabel(row.action)}</td>
                  <td className={td}>{row.entityLabel ?? entityLabel(row.entityType)}</td>
                  <td className={td}>{row.change ?? 'Sin datos para mostrar'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {hasRequests ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[40rem] text-left text-body-sm">
            <caption className="sr-only">Resultado de la consulta de pedidos de adaptación</caption>
            <thead>
              <tr className="border-b border-border text-ink-muted">
                <th scope="col" className={th}>
                  Asunto
                </th>
                <th scope="col" className={th}>
                  Estado
                </th>
                <th scope="col" className={th}>
                  Vence
                </th>
                <th scope="col" className={th}>
                  Responsable
                </th>
                <th scope="col" className={th}>
                  Formato
                </th>
              </tr>
            </thead>
            <tbody>
              {query.requestRows.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-b-0">
                  <td className={td}>{row.subject}</td>
                  <td className={td}>
                    {row.status}
                    {row.overdue ? <span className="block text-danger">Vencido</span> : null}
                  </td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>
                    {formatDate(row.dueDate)}
                  </td>
                  <td className={td}>{row.assigneeName ?? 'Sin asignar'}</td>
                  <td className={td}>{row.preferredFormat}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {link ? (
        <Link href={link} className="text-body-sm">
          Ver en la pantalla completa
        </Link>
      ) : null}
    </div>
  );
}
