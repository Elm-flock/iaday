import { StatusBadge } from '@/components/ui/status-badge';
import { Tag } from '@/components/ui/tag';
import type { Objective } from '@/lib/dal/objectives';
import { OBJECTIVE_ORIGIN_LABEL, OBJECTIVE_STATUS_LABEL, OBJECTIVE_TYPE_LABEL } from '../messages';
import { limitStatus } from '../policy';

/** Estado del objetivo: ícono + palabra (nunca solo color). */
export function ObjectiveStatusBadge({ status }: { status: Objective['status'] }) {
  return (
    <StatusBadge tone={status === 'PUBLISHED' ? 'success' : 'info'}>
      {OBJECTIVE_STATUS_LABEL[status]}
    </StatusBadge>
  );
}

export function ObjectiveTags({ objective }: { objective: Pick<Objective, 'type' | 'origin'> }) {
  return (
    <>
      <Tag>{OBJECTIVE_TYPE_LABEL[objective.type]}</Tag>
      <Tag>{OBJECTIVE_ORIGIN_LABEL[objective.origin]}</Tag>
    </>
  );
}

/**
 * Cupo de objetivos de un responsable en el ciclo (3 a 5, borradores + publicados).
 * Con `exact` el conteo es completo; si no, solo se ven los publicados y no se afirma un cupo.
 */
export function LimitIndicator({ count, exact }: { count: number; exact: boolean }) {
  if (!exact) {
    return (
      <span className="text-body-sm text-ink-muted">
        {count} {count === 1 ? 'objetivo publicado' : 'objetivos publicados'}
      </span>
    );
  }
  const { max, reached } = limitStatus(count);
  return (
    <span className="flex flex-wrap items-center gap-s10">
      <span className="text-body-sm text-ink" data-testid="limit-indicator">
        {count} de {max} objetivos
      </span>
      {reached ? (
        <StatusBadge tone="warning">Llegó al máximo</StatusBadge>
      ) : count < 3 ? (
        <span className="text-body-sm text-ink-muted">Faltan {3 - count} para publicar</span>
      ) : null}
    </span>
  );
}
