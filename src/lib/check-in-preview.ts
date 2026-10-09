import { scoreBand, type ScoreBand } from './score-band';

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Score de un KR numérico, espejo del back (`krScore`): clamp((actual - inicio) / (meta - inicio), 0, 1)
 * redondeado a 4 decimales. Funciona con meta < inicio (el recorrido va "hacia abajo").
 * Con inicio == meta (el back lo rechaza al definir el KR) es defensivo: 1 si ya está en la meta, si no 0.
 */
export function derivedScore(start: number, target: number, current: number): number {
  if (start === target) return current === target ? 1 : 0;
  return round4(clamp01((current - start) / (target - start)));
}

/** Score manual válido: múltiplo de 0,1 entre 0 y 1. */
export function isManualStep(score: number): boolean {
  const tenths = score * 10;
  return (
    Number.isFinite(score) &&
    score >= 0 &&
    score <= 1 &&
    Math.abs(tenths - Math.round(tenths)) < 1e-9
  );
}

export type PreviewInput =
  | { scoring: 'DERIVED'; start: number; target: number; value: number | null }
  | { scoring: 'MANUAL'; manualScore: number | null };

export type CheckInPreview = { score: number; band: ScoreBand };

/** Score y banda que resultarían de registrar el check-in; `null` si todavía falta o no es válido el dato. */
export function previewCheckIn(input: PreviewInput): CheckInPreview | null {
  if (input.scoring === 'MANUAL') {
    if (input.manualScore === null || !isManualStep(input.manualScore)) return null;
    return { score: input.manualScore, band: scoreBand(input.manualScore) };
  }
  if (input.value === null || !Number.isFinite(input.value)) return null;
  const score = derivedScore(input.start, input.target, input.value);
  return { score, band: scoreBand(score) };
}

/** Banda del back (`RED|YELLOW|GREEN`) a la del front. */
export function bandFromApi(band: 'RED' | 'YELLOW' | 'GREEN'): ScoreBand {
  return band === 'GREEN' ? 'on-track' : band === 'YELLOW' ? 'attention' : 'at-risk';
}
