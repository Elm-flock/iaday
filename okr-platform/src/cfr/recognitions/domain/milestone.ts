export const MILESTONE_KR_SCORE = 0.7;

/** Hito válido: KR con score >= 0.7 u objetivo CLOSED. */
export function isMilestone(
  kr: { score: number } | null,
  objective: { status: 'DRAFT' | 'PUBLISHED' | 'CLOSED' } | null,
): boolean {
  return (
    (kr !== null && kr.score >= MILESTONE_KR_SCORE) ||
    (objective !== null && objective.status === 'CLOSED')
  );
}
