import type { Objective } from '@/lib/dal/objectives';
import type { CurrentUser } from '@/lib/dal/session';
import { OBJECTIVE_MAX } from './messages';

/** Reflejo de las políticas del back para decidir qué mostrar habilitado. La autorización real es de Nest. */
export type Viewer = Pick<CurrentUser, 'id' | 'role' | 'teams'>;

type OwnerRef = Pick<Objective, 'ownerUserId' | 'ownerTeamId'>;

const leads = (viewer: Viewer, teamId: string | null) =>
  teamId !== null && viewer.teams.some((t) => t.teamId === teamId && t.isLead);

/** Edita el objetivo: ADMIN, su responsable (usuario) o el líder del equipo responsable. */
export function canEditObjective(viewer: Viewer, objective: OwnerRef): boolean {
  return (
    viewer.role === 'ADMIN' ||
    (objective.ownerUserId !== null && objective.ownerUserId === viewer.id) ||
    leads(viewer, objective.ownerTeamId)
  );
}

/**
 * Cambia inicio/meta tras publicar: ADMIN, líder del equipo responsable o líder de algún equipo del
 * responsable individual. De este último no conocemos los equipos en el front: a cualquier LÍDER se le
 * ofrece el campo y el back confirma (403 con copy claro si no corresponde).
 */
export function canChangeKrTarget(viewer: Viewer, objective: OwnerRef): boolean {
  if (viewer.role === 'ADMIN' || leads(viewer, objective.ownerTeamId)) return true;
  return (
    viewer.role === 'LEADER' &&
    objective.ownerUserId !== null &&
    objective.ownerUserId !== viewer.id
  );
}

export type OwnerOption = { value: string; label: string };
export type OwnerChoices = { users: OwnerOption[]; teams: OwnerOption[]; explanation: string };

type Directory = {
  users: { id: string; name: string; active: boolean }[];
  teams: { id: string; name: string }[];
};

/**
 * Responsables que la persona puede elegir al crear un objetivo (mismo criterio que `canCreateObjectiveFor`):
 * MEMBER solo a sí misma; LEADER a sí misma o los equipos que lidera; ADMIN a cualquiera.
 * Los líderes NO crean objetivos individuales de sus integrantes.
 */
export function ownerChoices(viewer: Viewer, directory: Directory): OwnerChoices {
  if (viewer.role === 'ADMIN') {
    return {
      users: directory.users
        .filter((u) => u.active)
        .map((u) => ({ value: `user:${u.id}`, label: u.name })),
      teams: directory.teams.map((t) => ({ value: `team:${t.id}`, label: t.name })),
      explanation: 'Como administración podés crear objetivos para cualquier persona o equipo.',
    };
  }
  const self = directory.users.find((u) => u.id === viewer.id);
  const selfOption = { value: `user:${viewer.id}`, label: `${self?.name ?? 'Yo'} (vos)` };
  if (viewer.role === 'LEADER') {
    return {
      users: [selfOption],
      teams: viewer.teams
        .filter((t) => t.isLead)
        .map((t) => ({ value: `team:${t.teamId}`, label: t.name })),
      explanation:
        'Podés crear objetivos propios o de los equipos que liderás. Los objetivos individuales de tus integrantes los crea cada persona.',
    };
  }
  return {
    users: [selfOption],
    teams: [],
    explanation: 'Solo podés crear objetivos propios. Los de equipo los crea su líder.',
  };
}

export type LimitStatus = { count: number; max: number; reached: boolean };

/** Cuántos objetivos (borrador + publicados) tiene un responsable, contra el máximo. */
export function limitStatus(count: number): LimitStatus {
  return { count, max: OBJECTIVE_MAX, reached: count >= OBJECTIVE_MAX };
}

export const ownerKey = (o: OwnerRef): string =>
  o.ownerUserId ? `user:${o.ownerUserId}` : `team:${o.ownerTeamId}`;

/** Objetivos por responsable que ocupan cupo en el ciclo (borrador + publicado; los cerrados no cuentan). */
export function countsByOwner(objectives: Objective[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const o of objectives) {
    if (o.status === 'CLOSED') continue;
    const key = ownerKey(o);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
