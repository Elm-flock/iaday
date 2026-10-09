import { BandBadge, NoCheckInsBadge, OverdueBadge } from '@/components/ui/status-badge';
import type { KeyResult, Objective } from '@/lib/dal/objectives';

type ProgressState =
  { kind: 'neutral' } | { kind: 'overdue' } | { kind: 'banded'; score: number; overdue: boolean };

/**
 * Estado de avance de un KR: sin check-ins no hay banda (neutro, o "vencido" si ya pasó la cadencia);
 * con check-ins hay banda, y si además está vencido se avisa aparte.
 */
export function krProgressState(
  kr: Pick<KeyResult, 'hasCheckIns' | 'overdue' | 'score'>,
): ProgressState {
  if (!kr.hasCheckIns) return kr.overdue ? { kind: 'overdue' } : { kind: 'neutral' };
  return { kind: 'banded', score: kr.score, overdue: kr.overdue };
}

/** Objetivo: neutro mientras ningún KR tenga check-ins; "vencido" si algún KR lo está y aún no hay datos. */
export function objectiveProgressState(
  objective: Pick<Objective, 'hasCheckIns' | 'score' | 'keyResults'>,
): ProgressState {
  const overdue = objective.keyResults.some((kr) => kr.overdue);
  if (!objective.hasCheckIns) return overdue ? { kind: 'overdue' } : { kind: 'neutral' };
  return { kind: 'banded', score: objective.score, overdue };
}

/** Hay datos para mostrar score y barra (solo con estado con banda). */
export const hasScore = (
  state: ProgressState,
): state is Extract<ProgressState, { kind: 'banded' }> => state.kind === 'banded';

function ProgressBadge({ state }: { state: ProgressState }) {
  if (state.kind === 'neutral') return <NoCheckInsBadge />;
  if (state.kind === 'overdue') return <OverdueBadge />;
  return (
    <span className="inline-flex flex-wrap items-center gap-s5">
      <BandBadge score={state.score} />
      {state.overdue ? <OverdueBadge /> : null}
    </span>
  );
}

export function KrProgressBadge({
  kr,
}: {
  kr: Pick<KeyResult, 'hasCheckIns' | 'overdue' | 'score'>;
}) {
  return <ProgressBadge state={krProgressState(kr)} />;
}

export function ObjectiveProgressBadge({
  objective,
}: {
  objective: Pick<Objective, 'hasCheckIns' | 'score' | 'keyResults'>;
}) {
  return <ProgressBadge state={objectiveProgressState(objective)} />;
}
