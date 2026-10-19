import { RequestRowActions, type AdminOption } from './request-row-actions';
import { ENTITY_LABEL, FORMAT_LABEL } from '../../../pedidos-adaptacion/messages';
import {
  RequestOverdueBadge,
  RequestStatusBadge,
} from '../../../pedidos-adaptacion/_components/request-badges';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/cn';
import type { AdaptationRequest } from '@/lib/dal/adaptation-requests';
import { formatDate } from '@/lib/format';

const th = 'px-s15 py-s10 font-normal';

/**
 * Pedidos para administración. Los vencidos se resaltan con fondo de advertencia, ícono y la palabra
 * "Vencido" (el estado nunca va solo en color). Presentacional.
 */
export function RequestsTable({
  items,
  admins,
  currentUserId,
}: {
  items: AdaptationRequest[];
  admins: AdminOption[];
  currentUserId: string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No hay pedidos con este filtro"
        description="Cuando alguien pida un documento adaptado, lo vas a ver acá."
      />
    );
  }
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[56rem] text-left text-body-sm">
        <caption className="sr-only">Pedidos de documentos adaptados</caption>
        <thead>
          <tr className="border-b border-border text-ink-muted">
            <th scope="col" className={th}>
              Pedido
            </th>
            <th scope="col" className={th}>
              Estado
            </th>
            <th scope="col" className={th}>
              Fecha límite
            </th>
            <th scope="col" className={th}>
              Responsable
            </th>
            <th scope="col" className={cn(th, 'text-right')}>
              Acciones
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => {
            const open = r.status === 'PENDIENTE' || r.status === 'EN_CURSO';
            return (
              <tr
                key={r.id}
                data-testid="admin-adaptation-request"
                data-overdue={r.overdue ? 'true' : undefined}
                className={cn(
                  'border-b border-border align-top last:border-b-0',
                  r.overdue && 'bg-warning-subtle',
                )}
              >
                <th scope="row" className="px-s15 py-s10 font-normal">
                  <span className="block text-body font-bold text-ink">{r.subject}</span>
                  <span className="block text-ink-muted">
                    {r.requesterName ?? 'Persona eliminada'} · {FORMAT_LABEL[r.preferredFormat]}
                  </span>
                  {r.entityType ? (
                    <span className="block text-caption text-ink-muted">
                      Vinculado a {ENTITY_LABEL[r.entityType]}
                      {r.entityType === 'FEEDBACK'
                        ? ' (privado: administración no lo puede leer)'
                        : ''}
                    </span>
                  ) : null}
                  {r.description ? (
                    <span className="mt-s5 block whitespace-pre-line text-ink">
                      {r.description}
                    </span>
                  ) : null}
                  {r.status === 'ENTREGADA' && r.resolutionNote ? (
                    <span className="mt-s5 block text-ink-muted">
                      Nota de entrega: {r.resolutionNote}
                    </span>
                  ) : null}
                  {r.status === 'RECHAZADA' && r.rejectionJustification ? (
                    <span className="mt-s5 block text-ink-muted">
                      Justificación: {r.rejectionJustification}
                    </span>
                  ) : null}
                </th>
                <td className="px-s15 py-s10">
                  <div className="flex flex-wrap items-center gap-s5">
                    <RequestStatusBadge status={r.status} />
                    {r.overdue ? <RequestOverdueBadge /> : null}
                  </div>
                </td>
                <td className="px-s15 py-s10 whitespace-nowrap tabular-nums">
                  {open ? formatDate(r.dueDate) : 'Resuelto'}
                </td>
                <td className="px-s15 py-s10">{r.assigneeName ?? 'Sin asignar'}</td>
                <td className="px-s15 py-s10">
                  {open ? (
                    <RequestRowActions request={r} admins={admins} currentUserId={currentUserId} />
                  ) : (
                    <span className="block text-right text-ink-muted">Sin acciones</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
