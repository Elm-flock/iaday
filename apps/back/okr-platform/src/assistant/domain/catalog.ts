import type { HandleInfo } from './plan-validate';

export const CATALOG_LIMITS = {
  users: 500,
  teams: 200,
  cycles: 50,
  objectives: 300,
  keyResults: 600,
};

export interface CatalogRows {
  users: { id: string; name: string; role: string; active: boolean; teamIds: string[] }[];
  teams: {
    id: string;
    name: string;
    parentId: string | null;
    leadIds: string[];
    memberCount: number;
  }[];
  cycles: {
    id: string;
    name: string;
    kind: string;
    status: string;
    parentId: string | null;
    startDate: Date;
    endDate: Date;
  }[];
  objectives: {
    id: string;
    title: string;
    cycleId: string;
    ownerUserId: string | null;
    ownerTeamId: string | null;
    status: string;
    krCount: number;
  }[];
  keyResults: { id: string; objectiveId: string; title: string; ownerId: string }[];
}

/** Catálogo que viaja al agente (contrato §3.4): handles opacos, sin emails ni descripciones. */
export interface Catalog {
  users: { handle: string; name: string; role: string; active: boolean; teams: string[] }[];
  teams: {
    handle: string;
    name: string;
    parent: string | null;
    leads: string[];
    memberCount: number;
  }[];
  cycles: {
    handle: string;
    name: string;
    kind: string;
    status: string;
    parent: string | null;
    startDate: string;
    endDate: string;
  }[];
  objectives: {
    handle: string;
    title: string;
    cycle: string;
    ownerUser: string | null;
    ownerTeam: string | null;
    status: string;
    krCount: number;
  }[];
  keyResults: { handle: string; objective: string; title: string; owner: string }[];
}

export interface BuiltCatalog {
  catalog: Catalog;
  /** handle -> entidad (con etiqueta y estado) para validar y mostrar. */
  handles: Record<string, HandleInfo>;
  /** handle -> UUID, lo único que se persiste junto al plan. */
  handleMap: Record<string, string>;
  truncated: boolean;
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
const STATUS_ORDER: Record<string, number> = { ACTIVE: 0, DRAFT: 1, CLOSED: 2 };
const rank = (status: string | undefined): number => STATUS_ORDER[status ?? ''] ?? 9;

/**
 * Arma el catálogo con handles `U1`, `T3`, `C2`, `O7`, `K12` numerados por tipo en el orden de envío.
 * Respeta los límites del contrato priorizando personas activas y ciclos ACTIVE; marca `truncated`.
 */
export function buildCatalog(rows: CatalogRows, limits = CATALOG_LIMITS): BuiltCatalog {
  let truncated = false;
  const cap = <T>(items: T[], max: number): T[] => {
    if (items.length > max) truncated = true;
    return items.slice(0, max);
  };

  const users = cap(
    [...rows.users].sort((a, b) => Number(b.active) - Number(a.active) || byName(a, b)),
    limits.users,
  );
  const teams = cap([...rows.teams].sort(byName), limits.teams);
  const cycles = cap(
    [...rows.cycles].sort((a, b) => rank(a.status) - rank(b.status) || byName(a, b)),
    limits.cycles,
  );
  const cycleStatus = new Map(cycles.map((c) => [c.id, c.status]));
  const objectives = cap(
    rows.objectives
      .filter((o) => {
        const s = cycleStatus.get(o.cycleId);
        return (s === 'ACTIVE' || s === 'DRAFT') && o.status !== 'CLOSED';
      })
      .sort(
        (a, b) =>
          rank(cycleStatus.get(a.cycleId)) - rank(cycleStatus.get(b.cycleId)) ||
          a.title.localeCompare(b.title),
      ),
    limits.objectives,
  );
  const objectiveIds = new Set(objectives.map((o) => o.id));
  const keyResults = cap(
    rows.keyResults
      .filter((k) => objectiveIds.has(k.objectiveId))
      .sort((a, b) => a.title.localeCompare(b.title)),
    limits.keyResults,
  );

  const handles: Record<string, HandleInfo> = {};
  const handleMap: Record<string, string> = {};
  const byId = new Map<string, string>();
  const assign = (prefix: string, items: { id: string }[], info: (i: never) => HandleInfo) => {
    items.forEach((item, i) => {
      const handle = `${prefix}${i + 1}`;
      byId.set(item.id, handle);
      handleMap[handle] = item.id;
      handles[handle] = info(item as never);
    });
  };
  assign('U', users, (u: (typeof users)[number]) => ({ id: u.id, label: u.name }));
  assign('T', teams, (t: (typeof teams)[number]) => ({ id: t.id, label: t.name }));
  assign('C', cycles, (c: (typeof cycles)[number]) => ({
    id: c.id,
    label: c.name,
    status: c.status,
  }));
  assign('O', objectives, (o: (typeof objectives)[number]) => ({
    id: o.id,
    label: o.title,
    status: o.status,
  }));
  assign('K', keyResults, (k: (typeof keyResults)[number]) => ({ id: k.id, label: k.title }));

  const h = (id: string | null): string | null => (id ? (byId.get(id) ?? null) : null);
  const hs = (ids: string[]): string[] =>
    ids.map((id) => byId.get(id)).filter((x): x is string => Boolean(x));

  const catalog: Catalog = {
    users: users.map((u) => ({
      handle: byId.get(u.id)!,
      name: u.name,
      role: u.role,
      active: u.active,
      teams: hs(u.teamIds),
    })),
    teams: teams.map((t) => ({
      handle: byId.get(t.id)!,
      name: t.name,
      parent: h(t.parentId),
      leads: hs(t.leadIds),
      memberCount: t.memberCount,
    })),
    cycles: cycles.map((c) => ({
      handle: byId.get(c.id)!,
      name: c.name,
      kind: c.kind,
      status: c.status,
      parent: h(c.parentId),
      startDate: isoDate(c.startDate),
      endDate: isoDate(c.endDate),
    })),
    objectives: objectives.map((o) => ({
      handle: byId.get(o.id)!,
      title: o.title,
      cycle: h(o.cycleId)!,
      ownerUser: h(o.ownerUserId),
      ownerTeam: h(o.ownerTeamId),
      status: o.status,
      krCount: o.krCount,
    })),
    keyResults: keyResults.map((k) => ({
      handle: byId.get(k.id)!,
      objective: h(k.objectiveId)!,
      title: k.title,
      owner: h(k.ownerId) ?? '',
    })),
  };
  // Un KR cuyo responsable quedó fuera del catálogo (recorte) no se envía: no tendría un handle válido.
  catalog.keyResults = catalog.keyResults.filter((k) => k.owner !== '');
  return { catalog, handles, handleMap, truncated };
}
