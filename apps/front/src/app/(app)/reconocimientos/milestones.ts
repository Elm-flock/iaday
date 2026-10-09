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
  /** Presente en objetivos de equipo; ahí solo cuentan los KRs que ejecuta la persona. */
  ownerTeamId?: string | null;
  score: number;
  finalScore: number | null;
  keyResults: { id: string; title: string; score: number; ownerId?: string }[];
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
  /** El KR pertenece a un objetivo del equipo (la persona es responsable del KR). */
  inTeamObjective?: boolean;
};

/**
 * Hitos de una persona que se pueden reconocer, nunca de borradores:
 * - Objetivos propios (individuales): el objetivo si está CLOSED y sus KRs con score >= 0,70.
 * - Objetivos de EQUIPO: solo los KRs que la persona es responsable de ejecutar (`ownerId`) con
 *   score >= 0,70. El objetivo de equipo en sí no es un logro individual, aunque esté CLOSED.
 * El back valida de nuevo.
 */
export function listMilestones(
  objectives: MilestoneObjective[],
  userId: string,
): MilestoneOption[] {
  return objectives
    .filter((o) => o.status !== 'DRAFT')
    .flatMap((o) => {
      const own = o.ownerUserId === userId;
      const team = !own && o.ownerUserId === null && Boolean(o.ownerTeamId);
      if (!own && !team) return [];

      const options: MilestoneOption[] = [];
      if (own && isMilestone(null, { status: o.status })) {
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
        if (team && kr.ownerId !== userId) continue;
        if (!isMilestone({ score: kr.score }, null)) continue;
        options.push({
          value: encodeKeyResultLink(o.id, kr.id),
          kind: 'kr',
          objectiveId: o.id,
          keyResultId: kr.id,
          title: kr.title,
          objectiveTitle: o.title,
          score: kr.score,
          ...(team ? { inTeamObjective: true } : {}),
        });
      }
      return options;
    });
}
