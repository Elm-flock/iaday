import type { KeyResult } from '@/lib/dal/objectives';

/** Lo mínimo de un KR que necesita el formulario de check-in (datos serializables para el cliente). */
export type CheckInTarget = {
  objectiveId: string;
  krId: string;
  title: string;
  scoring: KeyResult['scoring'];
  unit: string | null;
  startValue: string | null;
  targetValue: string | null;
  currentValue: string | null;
  score: number;
};

export function toCheckInTarget(
  kr: Pick<
    KeyResult,
    | 'id'
    | 'objectiveId'
    | 'title'
    | 'scoring'
    | 'unit'
    | 'startValue'
    | 'targetValue'
    | 'currentValue'
    | 'score'
  >,
): CheckInTarget {
  return {
    objectiveId: kr.objectiveId,
    krId: kr.id,
    title: kr.title,
    scoring: kr.scoring,
    unit: kr.unit,
    startValue: kr.startValue,
    targetValue: kr.targetValue,
    currentValue: kr.currentValue,
    score: kr.score,
  };
}
