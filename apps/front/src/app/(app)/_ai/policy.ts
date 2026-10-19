import type { Viewer } from '../objetivos/policy';

export type AdaptableEntity = 'objective' | 'check-in' | 'feedback';

export const ADAPTABLE_ENTITIES: readonly AdaptableEntity[] = ['objective', 'check-in', 'feedback'];
export const ADAPTATION_LEVELS = ['EASY_READ', 'PLAIN'] as const;
export type AdaptationLevel = (typeof ADAPTATION_LEVELS)[number];

export const isAdaptableEntity = (value: unknown): value is AdaptableEntity =>
  ADAPTABLE_ENTITIES.includes(value as AdaptableEntity);
export const isAdaptationLevel = (value: unknown): value is AdaptationLevel =>
  ADAPTATION_LEVELS.includes(value as AdaptationLevel);

export type OwnerRef = { ownerUserId: string | null; ownerTeamId: string | null };

export type ValidationAbility =
  { allowed: true } | { allowed: false; reason: 'feedback' | 'permission' };

/**
 * Reflejo de `canValidateAdaptation` del back para decidir si se ofrece "Validar" (la autorización
 * real es de Nest). Objetivo y check-in:
 * - de EQUIPO: ADMIN o quien lidera (isLead) ese equipo.
 * - INDIVIDUAL: ADMIN o quien lidera (isLead) algún equipo de la persona responsable. En el front no
 *   conocemos los equipos de esa persona: se ofrece a quien lidere algún equipo y el back confirma
 *   (403 con copy claro). El rol global NO alcanza: lo que cuenta es `isLead`.
 * - El dueño individual NUNCA se autovalida (cuatro ojos), ni siquiera si lidera un equipo propio;
 *   solo ADMIN conserva el acceso.
 * Feedback: NUNCA (nadie fuera de emisor y receptor puede leerlo, no hay validador externo posible).
 */
export function canValidateAdaptation(
  viewer: Viewer,
  entity: AdaptableEntity,
  owner: OwnerRef | null,
): ValidationAbility {
  if (entity === 'feedback') return { allowed: false, reason: 'feedback' };
  if (!owner) return { allowed: false, reason: 'permission' };
  if (viewer.role === 'ADMIN') return { allowed: true };
  const leadsOwnerTeam =
    owner.ownerTeamId !== null &&
    viewer.teams.some((t) => t.teamId === owner.ownerTeamId && t.isLead);
  const leadsSomeTeam = viewer.teams.some((t) => t.isLead);
  const isOwnerPerson = owner.ownerUserId !== null && owner.ownerUserId === viewer.id;
  const allowed = owner.ownerUserId !== null ? leadsSomeTeam && !isOwnerPerson : leadsOwnerTeam;
  return allowed ? { allowed: true } : { allowed: false, reason: 'permission' };
}

/** Solo quien pidió la versión puede marcar "Me sirve" (el back responde 403 al resto). */
export const canAcceptAdaptation = (viewerId: string, requestedById: string | null): boolean =>
  requestedById !== null && requestedById === viewerId;

/** VALIDATED es terminal: el estado nunca vuelve atrás. */
export const isValidatable = (status: string): boolean => status !== 'VALIDATED';
