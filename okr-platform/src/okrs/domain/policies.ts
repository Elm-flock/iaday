import type { Role } from '../../common/types/auth-user';

export interface Actor {
  id: string;
  role: Role;
  teams: { teamId: string; isLead: boolean }[];
}

export interface PolicyObjective {
  ownerUserId: string | null;
  ownerTeamId: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
}

export const leadsTeam = (actor: Actor, teamId: string | null): boolean =>
  teamId !== null && actor.teams.some((t) => t.teamId === teamId && t.isLead);

const isMemberOf = (actor: Actor, teamId: string | null): boolean =>
  teamId !== null && actor.teams.some((t) => t.teamId === teamId);

/** MEMBER: solo a sí mismo; LEADER: a sí mismo o equipos que lidera; ADMIN: todo. */
export function canCreateObjectiveFor(
  actor: Actor,
  owner: { userId?: string; teamId?: string },
): boolean {
  if (!owner.userId && !owner.teamId) return false;
  if (actor.role === 'ADMIN') return true;
  if (owner.userId) return owner.userId === actor.id;
  return actor.role === 'LEADER' && leadsTeam(actor, owner.teamId ?? null);
}

/** Editan: owner usuario, líder del equipo owner, ADMIN. */
export function canEditObjective(actor: Actor, obj: PolicyObjective): boolean {
  return (
    actor.role === 'ADMIN' ||
    (obj.ownerUserId !== null && obj.ownerUserId === actor.id) ||
    leadsTeam(actor, obj.ownerTeamId)
  );
}

/** PUBLISHED/CLOSED: todo autenticado; DRAFT: solo quienes pueden editar. */
export function canViewObjective(actor: Actor, obj: PolicyObjective): boolean {
  return obj.status !== 'DRAFT' || canEditObjective(actor, obj);
}

/**
 * Cambiar start/target tras publicar (con audit): ADMIN, líder del equipo owner
 * o líder de algún equipo del owner usuario (`ownerUserTeamIds`).
 */
export function canEditKrTargetAfterPublish(
  actor: Actor,
  obj: PolicyObjective,
  ownerUserTeamIds: string[] = [],
): boolean {
  return (
    actor.role === 'ADMIN' ||
    leadsTeam(actor, obj.ownerTeamId) ||
    ownerUserTeamIds.some((teamId) => leadsTeam(actor, teamId))
  );
}

/**
 * Check-in: owner del KR, owner usuario del objetivo, miembros del equipo owner
 * y su líder. Sin bypass para ADMIN.
 */
export function canCheckIn(actor: Actor, kr: { ownerId: string }, obj: PolicyObjective): boolean {
  return (
    kr.ownerId === actor.id ||
    (obj.ownerUserId !== null && obj.ownerUserId === actor.id) ||
    isMemberOf(actor, obj.ownerTeamId)
  );
}
