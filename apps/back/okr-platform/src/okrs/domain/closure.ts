export type ObjectiveType = 'COMMITTED' | 'ASPIRATIONAL';

export interface CycleThresholds {
  committed: number;
  aspirational: number;
}

/** Logrado si score >= umbral del ciclo según el tipo (borde inclusivo). */
export function isAchieved(
  type: ObjectiveType,
  finalScore: number,
  thresholds: CycleThresholds,
): boolean {
  const threshold = type === 'COMMITTED' ? thresholds.committed : thresholds.aspirational;
  return finalScore >= threshold;
}
