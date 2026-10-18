import { HANDLE_PATTERN, type RawReadQuery } from './plan-schema';
import { isQuoteGrounded } from './text';
import type { HandleInfo } from './plan-validate';

export const AUDIT_ENTITY_TYPES = ['User', 'Team', 'Cycle', 'Objective', 'KeyResult'] as const;
const ENTITY_PREFIX: Record<string, string> = {
  User: 'U',
  Team: 'T',
  Cycle: 'C',
  Objective: 'O',
  KeyResult: 'K',
};

/** El contrato habla en inglés (PENDING...), el módulo de solicitudes guarda en español. */
const REQUEST_STATUS_MAP: Record<string, 'PENDIENTE' | 'EN_CURSO' | 'ENTREGADA' | 'RECHAZADA'> = {
  PENDING: 'PENDIENTE',
  IN_PROGRESS: 'EN_CURSO',
  DELIVERED: 'ENTREGADA',
  REJECTED: 'RECHAZADA',
  PENDIENTE: 'PENDIENTE',
  EN_CURSO: 'EN_CURSO',
  ENTREGADA: 'ENTREGADA',
  RECHAZADA: 'RECHAZADA',
};

export const QUERY_LIMIT_DEFAULT = 10;
export const QUERY_LIMIT_MAX = 20;

export interface QueryContext {
  handles: Record<string, HandleInfo>;
  adminTexts: string[];
  /** Valores válidos de AuditAction. */
  auditActions: readonly string[];
}

export interface ResolvedAuditQuery {
  type: 'AUDIT_SEARCH';
  action: string | null;
  entity: { entityType: string; id: string; label: string } | null;
  actor: { id: string; label: string } | null;
  from: Date | null;
  to: Date | null;
  limit: number;
  sourceQuote: string;
}

export interface ResolvedRequestsQuery {
  type: 'ADAPTATION_REQUESTS_LIST';
  status: ('PENDIENTE' | 'EN_CURSO' | 'ENTREGADA' | 'RECHAZADA')[] | null;
  overdueOnly: boolean;
  assignee: { id: string; label: string } | null;
  limit: number;
  sourceQuote: string;
}

export type ResolvedQuery = ResolvedAuditQuery | ResolvedRequestsQuery;

export type QueryValidation =
  | { ok: true; query: ResolvedQuery }
  | { ok: false; issues: { code: 'QUERY_INVALID'; message: string }[] };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(value: string, endOfDay: boolean): Date | null {
  if (!DATE.test(value)) return null;
  const d = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}

/**
 * Valida una consulta de solo lectura del agente: tipo conocido, handles del tipo correcto,
 * fechas válidas y anclaje de `sourceQuote`. Nada se ejecuta si algo falla.
 */
export function validateQuery(raw: RawReadQuery, ctx: QueryContext): QueryValidation {
  const issues: { code: 'QUERY_INVALID'; message: string }[] = [];
  const bad = (message: string) => issues.push({ code: 'QUERY_INVALID', message });

  if (!isQuoteGrounded(raw.sourceQuote, ctx.adminTexts) || raw.sourceQuote.length < 3) {
    bad('La consulta no se corresponde con lo que escribiste.');
  }
  const limit = Math.min(QUERY_LIMIT_MAX, Math.max(1, raw.limit || QUERY_LIMIT_DEFAULT));
  const handle = (value: string, prefix: string, what: string): HandleInfo | null => {
    const info = HANDLE_PATTERN.test(value) && value[0] === prefix ? ctx.handles[value] : undefined;
    if (!info) bad(`La referencia "${value}" (${what}) no existe o es de otro tipo.`);
    return info ?? null;
  };

  if (raw.type === 'AUDIT_SEARCH') {
    let action: string | null = null;
    if (raw.action !== null) {
      if (ctx.auditActions.includes(raw.action)) action = raw.action;
      else bad(`La acción "${raw.action}" no existe en la auditoría.`);
    }
    let entity: ResolvedAuditQuery['entity'] = null;
    if (raw.entity) {
      const prefix = ENTITY_PREFIX[raw.entity.entityType];
      if (!prefix) bad(`El tipo de entidad "${raw.entity.entityType}" no se puede consultar.`);
      else {
        const info = handle(raw.entity.handle, prefix, 'entidad');
        if (info) entity = { entityType: raw.entity.entityType, id: info.id, label: info.label };
      }
    }
    const actorInfo = raw.actor ? handle(raw.actor, 'U', 'persona') : null;
    const from = raw.from !== null ? parseDay(raw.from, false) : null;
    const to = raw.to !== null ? parseDay(raw.to, true) : null;
    if (raw.from !== null && !from) bad('La fecha "desde" no es válida (AAAA-MM-DD).');
    if (raw.to !== null && !to) bad('La fecha "hasta" no es válida (AAAA-MM-DD).');
    if (from && to && from.getTime() > to.getTime())
      bad('La fecha "desde" es posterior a "hasta".');
    if (issues.length > 0) return { ok: false, issues };
    return {
      ok: true,
      query: {
        type: 'AUDIT_SEARCH',
        action,
        entity,
        actor: actorInfo ? { id: actorInfo.id, label: actorInfo.label } : null,
        from,
        to,
        limit,
        sourceQuote: raw.sourceQuote,
      },
    };
  }

  if (raw.type === 'ADAPTATION_REQUESTS_LIST') {
    let status: ResolvedRequestsQuery['status'] = null;
    if (raw.status && raw.status.length > 0) {
      const mapped = raw.status.map((s) => REQUEST_STATUS_MAP[s]);
      if (mapped.some((s) => !s)) bad('Algún estado de solicitud no existe.');
      else status = [...new Set(mapped)];
    }
    const assignee = raw.assignee ? handle(raw.assignee, 'U', 'persona asignada') : null;
    if (issues.length > 0) return { ok: false, issues };
    return {
      ok: true,
      query: {
        type: 'ADAPTATION_REQUESTS_LIST',
        status,
        overdueOnly: raw.overdueOnly === true,
        assignee: assignee ? { id: assignee.id, label: assignee.label } : null,
        limit,
        sourceQuote: raw.sourceQuote,
      },
    };
  }

  bad(`El tipo de consulta "${raw.type}" no está permitido.`);
  return { ok: false, issues };
}
