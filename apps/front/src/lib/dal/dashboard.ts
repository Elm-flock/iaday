import 'server-only';
import { listPendingCheckIns, type PendingCheckIn } from './check-ins';
import { listObjectives, type Objective } from './objectives';
import { listRecognitions, type Recognition } from './recognitions';
import type { CurrentUser } from './session';
import { getTeamDetail, type TeamDetail } from './teams';
import { listUsers } from './users';

/** Cantidad de KRs vencidos que se listan en el dashboard (el total se informa aparte). */
export const DASHBOARD_PENDING_LIMIT = 5;
/** Reconocimientos por lista (míos y del muro). */
export const DASHBOARD_RECOGNITIONS_LIMIT = 3;

export type MyObjectives = {
  individual: Objective[];
  team: { teamName: string; objectives: Objective[] }[];
};

const byTitle = (a: Objective, b: Objective) => a.title.localeCompare(b.title, 'es');

/**
 * Mis objetivos del ciclo: individuales (donde soy responsable) y, en grupo aparte, los de los equipos a los
 * que pertenezco. Filtrado en el server sobre `GET /objectives?cycleId` (cacheado por request).
 */
export async function getMyObjectives(user: CurrentUser, cycleId: string): Promise<MyObjectives> {
  const objectives = await listObjectives({ cycleId });
  const individual = objectives.filter((o) => o.ownerUserId === user.id).sort(byTitle);
  const team = user.teams
    .map((t) => ({
      teamName: t.name,
      objectives: objectives.filter((o) => o.ownerTeamId === t.teamId).sort(byTitle),
    }))
    .filter((g) => g.objectives.length > 0)
    .sort((a, b) => a.teamName.localeCompare(b.teamName, 'es'));
  return { individual, team };
}

/** Pendientes: el total y los primeros 5 (el back ya devuelve solo vencidos). */
export async function getPendingSummary(): Promise<{ total: number; top: PendingCheckIn[] }> {
  const pending = await listPendingCheckIns();
  return { total: pending.length, top: pending.slice(0, DASHBOARD_PENDING_LIMIT) };
}

export type DashboardRecognition = Recognition & { fromName: string; toName: string };

/** Últimos reconocimientos que recibí y últimos del muro, con nombres resueltos. Sin conteos por persona. */
export async function getRecognitionsSummary(
  userId: string,
): Promise<{ received: DashboardRecognition[]; wall: DashboardRecognition[] }> {
  const [received, wall, users] = await Promise.all([
    listRecognitions(1, userId, DASHBOARD_RECOGNITIONS_LIMIT),
    listRecognitions(1, undefined, DASHBOARD_RECOGNITIONS_LIMIT),
    listUsers(),
  ]);
  const names = new Map(users.map((u) => [u.id, u.name]));
  const name = (id: string) => names.get(id) ?? 'Persona sin nombre';
  const decorate = (r: Recognition): DashboardRecognition => ({
    ...r,
    fromName: name(r.fromUserId),
    toName: name(r.toUserId),
  });
  return { received: received.items.map(decorate), wall: wall.items.map(decorate) };
}

export type LedTeam = { id: string; name: string; originMix: TeamDetail['originMix'] };

/** Equipos que lidero con su indicador 50/50 del ciclo (todos en paralelo). */
export async function getLedTeams(user: CurrentUser, cycleId: string): Promise<LedTeam[]> {
  const led = user.teams.filter((t) => t.isLead);
  const details = await Promise.all(led.map((t) => getTeamDetail(t.teamId, cycleId)));
  return led
    .map((t, i) => ({ id: t.teamId, name: t.name, originMix: details[i]?.originMix ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
