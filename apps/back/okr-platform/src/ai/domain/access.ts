import { err, ok, type Result } from '../../common/domain/result';
import { canViewFeedback } from '../../cfr/feedback/domain/privacy';
import {
  canEditKrTargetAfterPublish,
  canViewObjective,
  type Actor,
  type PolicyObjective,
} from '../../okrs/domain/policies';

export type AdaptTarget =
  | { type: 'OBJECTIVE' | 'CHECK_IN'; objective: PolicyObjective }
  | { type: 'FEEDBACK'; fromUserId: string; toUserId: string };

/**
 * Quién puede pedir/leer una adaptación: quien puede ver la entidad de origen.
 * FEEDBACK: solo emisor y receptor, SIN bypass (ni ADMIN ni LEADER). El fallo es
 * `NOT_VISIBLE` y el servicio lo traduce a 404 (indistinguible de inexistente).
 */
export function canAdapt(actor: Actor, target: AdaptTarget): Result {
  if (target.type === 'FEEDBACK') {
    return canViewFeedback(actor.id, target) ? ok() : err('NOT_VISIBLE', 'Feedback no encontrado');
  }
  return canViewObjective(actor, target.objective)
    ? ok()
    : err('NOT_VISIBLE', 'Objetivo no encontrado');
}

/**
 * Validación humana (RD 707/2026 art. 4.2.g): ADMIN o líder (isLead) del equipo dueño del
 * objetivo o de un equipo del usuario dueño. El dueño individual no se autovalida (cuatro ojos),
 * aunque además sea líder de uno de sus equipos; solo ADMIN conserva el bypass.
 * FEEDBACK nunca es validable: nadie fuera de emisor/receptor puede leerlo.
 */
export function canValidateAdaptation(
  actor: Actor,
  entityType: string,
  objective: PolicyObjective | null,
  ownerUserTeamIds: string[] = [],
): Result {
  if (entityType === 'FEEDBACK') {
    return err(
      'AI_VALIDATION_NOT_ALLOWED',
      'El feedback es privado: no tiene validación externa. Solo podés marcar que te sirve.',
    );
  }
  const isOwnObjective = objective?.ownerUserId != null && objective.ownerUserId === actor.id;
  if (
    !objective ||
    (isOwnObjective && actor.role !== 'ADMIN') ||
    !canEditKrTargetAfterPublish(actor, objective, ownerUserTeamIds)
  ) {
    return err(
      'FORBIDDEN',
      'Solo un administrador o el líder del equipo puede validar esta versión',
    );
  }
  return ok();
}

/** Aceptar / decidir una sugerencia: solo quien la pidió. */
export const canDecide = (actorId: string, requestedById: string | null): boolean =>
  requestedById !== null && actorId === requestedById;
