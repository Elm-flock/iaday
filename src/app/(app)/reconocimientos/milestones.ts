import { encodeKeyResultLink, encodeObjectiveLink } from '@/lib/okr-link';

/** Umbral de hito para un KR. Espejo de `MILESTONE_KR_SCORE` del back (inclusivo). */
export const MILESTONE_KR_SCORE = 0.7;

type ObjectiveStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';

/** Espejo de `isMilestone` del back: KR con score >= 0,70 u objetivo CLOSED. */
export function isMilestone(
  kr: { score: number } | null,
  objective: { status: ObjectiveStatus } | null,
): boolean {
  return (
    (kr !== null && kr.score >= MILESTONE_KR_SCORE) ||
    (objective !== null && objective.status === 'CLOSED')
  );
}

type MilestoneObjective = {
  id: string;
  title: string;
  status: ObjectiveStatus;
  ownerUserId: string | null;
  score: number;
  finalScore: number | null;
  keyResults: { id: string; title: string; score: number }[];
};

export type MilestoneOption = {
  /** Valor del <select> (ver `lib/okr-link`). */
  value: string;
  kind: 'kr' | 'objective';
  objectiveId: string;
  keyResultId?: string;
  title: string;
  objectiveTitle: string;
  score: number;
};

/**
 * Hitos de una persona que se pueden reconocer: sus KRs con score >= 0,70 y sus objetivos CLOSED.
 * Solo objetivos propios de la persona (individuales) y nunca borradores. El back valida de nuevo.
 */
export function listMilestones(
  objectives: MilestoneObjective[],
  userId: string,
): MilestoneOption[] {
  return objectives
    .filter((o) => o.ownerUserId === userId && o.status !== 'DRAFT')
    .flatMap((o) => {
      const options: MilestoneOption[] = [];
      if (isMilestone(null, { status: o.status })) {
        options.push({
          value: encodeObjectiveLink(o.id),
          kind: 'objective',
          objectiveId: o.id,
          title: o.title,
          objectiveTitle: o.title,
          score: o.finalScore ?? o.score,
        });
      }
      for (const kr of o.keyResults) {
        if (!isMilestone({ score: kr.score }, null)) continue;
        options.push({
          value: encodeKeyResultLink(o.id, kr.id),
          kind: 'kr',
          objectiveId: o.id,
          keyResultId: kr.id,
          title: kr.title,
          objectiveTitle: o.title,
          score: kr.score,
        });
      }
      return options;
    });
}
