import type { KeyResult, Objective } from '@/lib/dal/objectives';
import type { CurrentUser } from '@/lib/dal/session';
import {
  CHECK_IN_CLOSED_REASON,
  CHECK_IN_DRAFT_REASON,
  CHECK_IN_FORBIDDEN_REASON,
} from './messages';

export type Viewer = Pick<CurrentUser, 'id' | 'role' | 'teams'>;

/**
 * Espejo de `canCheckIn` del back: responsable del KR, responsable (usuario) del objetivo o integrante
 * del equipo responsable (su líder incluido). NO hay atajo para ADMIN. La autorización real es de Nest.
 */
export function canCheckIn(
  viewer: Viewer,
  objective: Pick<Objective, 'ownerUserId' | 'ownerTeamId'>,
  kr: Pick<KeyResult, 'ownerId'>,
): boolean {
  return (
    kr.ownerId === viewer.id ||
    (objective.ownerUserId !== null && objective.ownerUserId === viewer.id) ||
    (objective.ownerTeamId !== null && viewer.teams.some((t) => t.teamId === objective.ownerTeamId))
  );
}

export type CheckInAvailability = { allowed: true } | { allowed: false; reason: string };

/** Si el check-in se puede registrar y, si no, por qué (se muestra junto a la acción deshabilitada). */
export function checkInAvailability(
  viewer: Viewer,
  objective: Pick<Objective, 'ownerUserId' | 'ownerTeamId' | 'status'>,
  kr: Pick<KeyResult, 'ownerId'>,
): CheckInAvailability {
  if (objective.status === 'DRAFT') return { allowed: false, reason: CHECK_IN_DRAFT_REASON };
  if (objective.status === 'CLOSED') return { allowed: false, reason: CHECK_IN_CLOSED_REASON };
  if (!canCheckIn(viewer, objective, kr)) {
    return { allowed: false, reason: CHECK_IN_FORBIDDEN_REASON };
  }
  return { allowed: true };
}
