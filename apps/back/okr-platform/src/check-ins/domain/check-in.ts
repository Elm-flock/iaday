import { err, ok, type Result } from '../../common/domain/result';
import { bandOf, type ScoreBand } from '../../okrs/domain/bands';
import { assertManualStep, krScore } from '../../okrs/domain/score';

export interface CheckInKr {
  scoring: 'DERIVED' | 'MANUAL';
  startValue: number | null;
  targetValue: number | null;
}

export interface CheckInInput {
  value?: number;
  manualScore?: number;
}

export interface CheckInSnapshot {
  value: number | null;
  score: number;
  band: ScoreBand;
}

/**
 * Calcula el snapshot (valor, score, banda) de un check-in.
 * DERIVED exige `value` y recalcula el score; MANUAL exige `manualScore` (pasos de 0.1).
 * La banda se calcula sobre el score ya redondeado que se persiste.
 */
export function evaluateCheckIn(kr: CheckInKr, input: CheckInInput): Result<CheckInSnapshot> {
  if (kr.scoring === 'MANUAL') {
    if (input.value !== undefined) {
      return err('CHECKIN_VALUE_NOT_ALLOWED', 'Un KR binario (MANUAL) no admite valor numérico');
    }
    if (input.manualScore === undefined) {
      return err('CHECKIN_MANUAL_SCORE_REQUIRED', 'Un KR binario (MANUAL) requiere manualScore');
    }
    const step = assertManualStep(input.manualScore);
    if (!step.ok) return step;
    const score = krScore({ scoring: 'MANUAL', manual: input.manualScore });
    return ok({ value: null, score, band: bandOf(score) });
  }

  if (input.manualScore !== undefined) {
    return err(
      'CHECKIN_MANUAL_SCORE_NOT_ALLOWED',
      'Un KR numérico (DERIVED) no admite score manual',
    );
  }
  if (input.value === undefined) {
    return err('CHECKIN_VALUE_REQUIRED', 'Un KR numérico (DERIVED) requiere el valor actual');
  }
  if (kr.startValue === null || kr.targetValue === null) {
    return err('KR_VALUES_REQUIRED', 'El KR numérico no tiene valor inicial y meta definidos');
  }
  const score = krScore({
    scoring: 'DERIVED',
    start: kr.startValue,
    target: kr.targetValue,
    current: input.value,
  });
  return ok({ value: input.value, score, band: bandOf(score) });
}

/** Solo se registran check-ins sobre objetivos PUBLISHED de ciclos no cerrados. */
export function assertCheckInAllowed(state: {
  objectiveStatus: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  cycleStatus: 'DRAFT' | 'ACTIVE' | 'CLOSED';
}): Result<void> {
  if (state.objectiveStatus === 'DRAFT') {
    return err('OBJECTIVE_NOT_PUBLISHED', 'Solo se hacen check-ins sobre objetivos publicados');
  }
  if (state.objectiveStatus === 'CLOSED') {
    return err('OBJECTIVE_CLOSED', 'El objetivo está cerrado');
  }
  if (state.cycleStatus === 'CLOSED') return err('CYCLE_CLOSED', 'El ciclo está cerrado');
  return ok();
}
