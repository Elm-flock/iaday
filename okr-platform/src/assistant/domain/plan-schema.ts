import { err, ok, type Result } from '../../common/domain/result';

/** Whitelist v1 (docs/ai/agent-contract-admin.md §4.3). Las acciones de solicitudes de adaptación NO están. */
export const ACTION_TYPES = [
  'CREATE_USER',
  'CREATE_TEAM',
  'SET_TEAM_MEMBER',
  'REMOVE_TEAM_MEMBER',
  'CREATE_CYCLE',
  'ACTIVATE_CYCLE',
  'CREATE_OBJECTIVE',
  'CREATE_KEY_RESULT',
  'SET_KEY_RESULT_OWNER',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const MAX_ACTIONS = 25;

export type HandleKind = 'U' | 'T' | 'C' | 'O' | 'K';
export const HANDLE_PATTERN = /^[UTCOKR][0-9]{1,4}$/;
export const REF_PATTERN = /^[a-z][a-z0-9]{0,15}$/;

export type ScalarType = 'string' | 'boolean' | 'number';

export interface ActionSpec {
  /** Tipo de entidad que crea (y por lo tanto exige `ref`), o null. */
  creates: HandleKind | null;
  scalars: Record<string, { type: ScalarType; optional: boolean }>;
  refs: Record<string, { kind: HandleKind; optional: boolean; existingOnly?: boolean }>;
}

const s = (optional = false) => ({ type: 'string' as const, optional });
const n = (optional = false) => ({ type: 'number' as const, optional });
const b = (optional = false) => ({ type: 'boolean' as const, optional });

/** Forma de cada acción: de acá salen el parseo estructural, la resolución de refs y el DTO. */
export const ACTION_SPECS: Record<ActionType, ActionSpec> = {
  CREATE_USER: {
    creates: 'U',
    scalars: { name: s(), email: s(), role: s(true) },
    refs: {},
  },
  CREATE_TEAM: {
    creates: 'T',
    scalars: { name: s() },
    refs: { parent: { kind: 'T', optional: false } },
  },
  SET_TEAM_MEMBER: {
    creates: null,
    scalars: { isLead: b() },
    refs: { team: { kind: 'T', optional: false }, user: { kind: 'U', optional: false } },
  },
  REMOVE_TEAM_MEMBER: {
    creates: null,
    scalars: {},
    refs: {
      team: { kind: 'T', optional: false, existingOnly: true },
      user: { kind: 'U', optional: false, existingOnly: true },
    },
  },
  CREATE_CYCLE: {
    creates: 'C',
    scalars: {
      name: s(),
      kind: s(),
      startDate: s(),
      endDate: s(),
      checkInCadence: s(true),
      committedThreshold: n(true),
      aspirationalThreshold: n(true),
    },
    refs: { parent: { kind: 'C', optional: true } },
  },
  ACTIVATE_CYCLE: {
    creates: null,
    scalars: {},
    refs: { cycle: { kind: 'C', optional: false } },
  },
  CREATE_OBJECTIVE: {
    creates: 'O',
    // El contrato llama `type` al tipo de objetivo, pero choca con el discriminador: viaja como `objectiveType`.
    scalars: { title: s(), description: s(true), origin: s(), objectiveType: s() },
    refs: {
      cycle: { kind: 'C', optional: false },
      // `owner` se aplana: ownerUser (U) o ownerTeam (T); exactamente uno (se verifica en el parseo).
      ownerUser: { kind: 'U', optional: true },
      ownerTeam: { kind: 'T', optional: true },
      parentObjective: { kind: 'O', optional: true, existingOnly: true },
    },
  },
  CREATE_KEY_RESULT: {
    creates: 'K',
    scalars: {
      title: s(),
      scoring: s(),
      unit: s(true),
      startValue: s(true),
      targetValue: s(true),
    },
    refs: {
      objective: { kind: 'O', optional: false },
      owner: { kind: 'U', optional: false },
    },
  },
  SET_KEY_RESULT_OWNER: {
    creates: null,
    scalars: {},
    refs: { keyResult: { kind: 'K', optional: false }, owner: { kind: 'U', optional: false } },
  },
};

export type RawRef = { kind: 'EXISTING'; handle: string } | { kind: 'NEW'; ref: string };

/** Acción tal como llega del agente, ya aplanada pero sin resolver (el `type` puede ser desconocido). */
export interface RawAction {
  type: string;
  sourceQuote: string;
  ref: string | null;
  scalars: Record<string, unknown>;
  refs: Record<string, RawRef | null>;
  /** Problemas de forma detectados al parsear (la validación los reporta como DTO_INVALID). */
  shapeProblems: string[];
}

export interface RawPlan {
  summary: string;
  assumptions: string[];
  actions: RawAction[];
}

export interface RawReadQuery {
  type: string;
  sourceQuote: string;
  limit: number;
  action: string | null;
  entity: { entityType: string; handle: string } | null;
  actor: string | null;
  from: string | null;
  to: string | null;
  status: string[] | null;
  overdueOnly: boolean | null;
  assignee: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const optStr = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function parseRef(v: unknown): RawRef | null | 'bad' {
  if (v === undefined || v === null) return null;
  if (!isRecord(v)) return 'bad';
  if (v.kind === 'EXISTING' && typeof v.handle === 'string') {
    return { kind: 'EXISTING', handle: v.handle };
  }
  if (v.kind === 'NEW' && typeof v.ref === 'string') return { kind: 'NEW', ref: v.ref };
  return 'bad';
}

const TYPE_LABEL: Record<ScalarType, string> = {
  string: 'texto',
  boolean: 'verdadero/falso',
  number: 'número',
};

function parseAction(raw: unknown): RawAction {
  const input = isRecord(raw) ? raw : {};
  const type = typeof input.type === 'string' ? input.type : '';
  const action: RawAction = {
    type,
    sourceQuote: typeof input.sourceQuote === 'string' ? input.sourceQuote : '',
    ref: typeof input.ref === 'string' ? input.ref : null,
    scalars: {},
    refs: {},
    shapeProblems: [],
  };
  const spec = (ACTION_SPECS as Record<string, ActionSpec | undefined>)[type];
  if (!spec) return action; // UNKNOWN_ACTION lo informa la validación

  for (const [key, def] of Object.entries(spec.scalars)) {
    const value = input[key];
    if (value === undefined || value === null) {
      if (!def.optional) action.shapeProblems.push(`Falta el campo "${key}".`);
      continue;
    }
    if (typeof value !== def.type || (def.type === 'number' && !Number.isFinite(value))) {
      action.shapeProblems.push(`El campo "${key}" tiene que ser ${TYPE_LABEL[def.type]}.`);
      continue;
    }
    action.scalars[key] = value;
  }

  // Aplanado de owner en CREATE_OBJECTIVE: { kind: 'USER'|'TEAM', entity: EntityRef }.
  const source: Record<string, unknown> = { ...input };
  if (type === 'CREATE_OBJECTIVE') {
    const owner = isRecord(input.owner) ? input.owner : null;
    if (owner?.kind === 'USER') source.ownerUser = owner.entity;
    else if (owner?.kind === 'TEAM') source.ownerTeam = owner.entity;
    else action.shapeProblems.push('Falta quién es responsable del objetivo (usuario o equipo).');
  }
  for (const [key, def] of Object.entries(spec.refs)) {
    const parsed = parseRef(source[key]);
    if (parsed === 'bad') {
      action.shapeProblems.push(`La referencia "${key}" no tiene el formato esperado.`);
      action.refs[key] = null;
      continue;
    }
    if (parsed === null && !def.optional) {
      action.shapeProblems.push(`Falta la referencia "${key}".`);
    }
    action.refs[key] = parsed;
  }
  return action;
}

/** Parseo estructural del plan (sin class-validator): descarta campos desconocidos. */
export function parsePlan(raw: unknown): Result<RawPlan> {
  if (!isRecord(raw)) return err('PLAN_SHAPE', 'El plan no es un objeto.');
  if (typeof raw.summary !== 'string' || raw.summary.trim().length === 0) {
    return err('PLAN_SHAPE', 'El plan no tiene resumen.');
  }
  if (!Array.isArray(raw.actions) || raw.actions.length === 0) {
    return err('PLAN_SHAPE', 'El plan no tiene acciones.');
  }
  const assumptions = Array.isArray(raw.assumptions)
    ? raw.assumptions.filter((a): a is string => typeof a === 'string').slice(0, 5)
    : [];
  return ok({
    summary: raw.summary.trim().slice(0, 300),
    assumptions: assumptions.map((a) => a.slice(0, 200)),
    // Se parsean todas (incluso más de MAX_ACTIONS) para poder informar TOO_MANY_ACTIONS.
    actions: raw.actions.map(parseAction),
  });
}

export const READ_QUERY_TYPES = ['AUDIT_SEARCH', 'ADAPTATION_REQUESTS_LIST'] as const;

/** Parseo estructural de una consulta de solo lectura. */
export function parseReadQuery(raw: unknown): Result<RawReadQuery> {
  if (!isRecord(raw) || typeof raw.type !== 'string') {
    return err('QUERY_SHAPE', 'La consulta no tiene tipo.');
  }
  const entity =
    isRecord(raw.entity) &&
    typeof raw.entity.entityType === 'string' &&
    typeof raw.entity.handle === 'string'
      ? { entityType: raw.entity.entityType, handle: raw.entity.handle }
      : null;
  const limit = typeof raw.limit === 'number' && Number.isInteger(raw.limit) ? raw.limit : 10;
  return ok({
    type: raw.type,
    sourceQuote: typeof raw.sourceQuote === 'string' ? raw.sourceQuote : '',
    limit,
    action: optStr(raw.action),
    entity,
    actor: optStr(raw.actor),
    from: optStr(raw.from),
    to: optStr(raw.to),
    status: Array.isArray(raw.status)
      ? raw.status.filter((x): x is string => typeof x === 'string')
      : null,
    overdueOnly: typeof raw.overdueOnly === 'boolean' ? raw.overdueOnly : null,
    assignee: optStr(raw.assignee),
  });
}
