import type { CurrentUser } from '@/lib/dal/session';

/** Reflejo de las políticas del back para decidir qué mostrar. La autorización real es de Nest. */
export type TeamViewer = Pick<CurrentUser, 'role' | 'teams'>;

/**
 * Descarga el reporte PDF de un equipo: ADMIN o líder (`isLead`) de ESE equipo. Un LEADER de otro
 * equipo y los integrantes no lo ven (el back responde 403 `GET /reports/teams/:id`).
 */
export function canDownloadTeamReport(viewer: TeamViewer, teamId: string): boolean {
  return (
    viewer.role === 'ADMIN' || viewer.teams.some((t) => t.teamId === teamId && t.isLead === true)
  );
}
