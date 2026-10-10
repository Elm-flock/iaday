import { leadsTeam, type Actor } from '../../okrs/domain/policies';

/** Reporte de equipo: ADMIN o líder (`isLead`) de ESE equipo. Ni miembros ni líderes de otros equipos. */
export function canViewTeamReport(actor: Actor, teamId: string): boolean {
  return actor.role === 'ADMIN' || leadsTeam(actor, teamId);
}
