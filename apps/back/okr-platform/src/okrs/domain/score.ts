import { err, ok, type Result } from '../../common/domain/result';

export type KrScoreInput =
  | { scoring: 'DERIVED'; start: number; target: number; current: number }
  | { scoring: 'MANUAL'; manual: number };

/** Redondeo a 4 decimales (precisión de DB Decimal(5,4)). */
export const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Score de un KR en [0,1]; soporta target < start (métricas a la baja). */
export function krScore(input: KrScoreInput): number {
  if (input.scoring === 'MANUAL') return round4(clamp01(input.manual));
  const { start, target, current } = input;
  // La DB rechaza start == target en DERIVED; defensivo para evitar división por cero.
  if (start === target) return current === target ? 1 : 0;
  return round4(clamp01((current - start) / (target - start)));
}

/** El score manual debe ser múltiplo de 0.1 dentro de [0,1]. */
export function assertManualStep(score: number): Result<void> {
  const tenths = score * 10;
  const valid =
    Number.isFinite(score) &&
    score >= 0 &&
    score <= 1 &&
    Math.abs(tenths - Math.round(tenths)) < 1e-9;
  return valid
    ? ok()
    : err('INVALID_MANUAL_SCORE', 'El score manual debe ser múltiplo de 0.1 entre 0 y 1');
}

/** Promedio simple de los scores de KR; sin KRs -> 0. */
export function objectiveScore(krScores: number[]): number {
  if (krScores.length === 0) return 0;
  return round4(krScores.reduce((a, b) => a + b, 0) / krScores.length);
}
