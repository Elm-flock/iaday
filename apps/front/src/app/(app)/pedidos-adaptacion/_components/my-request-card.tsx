import { ENTITY_LABEL, FORMAT_LABEL, STATUS_HELP } from '../messages';
import { RequestOverdueBadge, RequestStatusBadge } from './request-badges';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import type { AdaptationRequest } from '@/lib/dal/adaptation-requests';
import { formatDate } from '@/lib/format';

/** Un pedido propio: estado, fecha límite y, si ya se resolvió, la nota o la justificación. Presentacional. */
export function MyRequestCard({ request }: { request: AdaptationRequest }) {
  const open = request.status === 'PENDIENTE' || request.status === 'EN_CURSO';
  return (
    <Card
      aria-label={`Pedido: ${request.subject}`}
      data-testid="adaptation-request"
      className="flex flex-col gap-s15"
    >
      <header className="flex flex-wrap items-start justify-between gap-s10">
        <h3 className="text-heading-3 font-light tracking-heading text-ink">{request.subject}</h3>
        <div className="flex flex-wrap items-center gap-s10">
          <RequestStatusBadge status={request.status} />
          {request.overdue ? <RequestOverdueBadge /> : null}
        </div>
      </header>

      <p className="text-body-sm text-ink-muted">{STATUS_HELP[request.status]}</p>

      <dl className="grid gap-x-s20 gap-y-s5 text-body-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-ink-muted">Formato</dt>
        <dd>{FORMAT_LABEL[request.preferredFormat]}</dd>
        {open ? (
          <>
            <dt className="text-ink-muted">Fecha límite</dt>
            <dd>{formatDate(request.dueDate)}</dd>
          </>
        ) : null}
        <dt className="text-ink-muted">Pedido el</dt>
        <dd>{formatDate(request.createdAt)}</dd>
        {request.assigneeName ? (
          <>
            <dt className="text-ink-muted">Se ocupa</dt>
            <dd>{request.assigneeName}</dd>
          </>
        ) : null}
        {request.entityType ? (
          <>
            <dt className="text-ink-muted">Vinculado a</dt>
            <dd>{ENTITY_LABEL[request.entityType]}</dd>
          </>
        ) : null}
      </dl>

      {request.description ? (
        <p className="text-body whitespace-pre-line text-ink">{request.description}</p>
      ) : null}

      {request.status === 'ENTREGADA' ? (
        <Alert tone="success" title="Nota de entrega">
          <p className="whitespace-pre-line">{request.resolutionNote}</p>
          {request.resolutionLink ? (
            <p className="mt-s10">
              <a
                href={request.resolutionLink}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm text-primary-text underline underline-offset-2 hover:text-primary-hover"
              >
                Abrir el documento adaptado
                <span className="sr-only"> (se abre en una pestaña nueva)</span>
              </a>
            </p>
          ) : null}
        </Alert>
      ) : null}

      {request.status === 'RECHAZADA' ? (
        <Alert tone="danger" title="Por qué no pudimos hacerlo">
          <p className="whitespace-pre-line">{request.rejectionJustification}</p>
        </Alert>
      ) : null}
    </Card>
  );
}
