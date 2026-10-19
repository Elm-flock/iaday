import { ROLE_LABEL } from '../usuarios/messages';
import { FEATURE_LABEL } from '../uso-ia/messages';
import type { AuditAction, AuditEntry } from '@/lib/dal/audit';
import { formatDate, formatNumber, formatScore, formatTime } from '@/lib/format';

/**
 * Etiquetas en español de CADA acción auditable. El tipo `Record<AuditAction, …>` hace que agregar
 * una acción nueva al back rompa el typecheck hasta que se rotule acá.
 */
export const ACTION_LABEL: Record<AuditAction, string> = {
  OBJECTIVE_PUBLISHED: 'Objetivo publicado',
  OBJECTIVE_CLOSED: 'Objetivo cerrado',
  KR_TARGET_CHANGED: 'Meta de un resultado clave cambiada',
  KR_SCORE_CHANGED: 'Avance de un resultado clave registrado',
  CYCLE_ACTIVATED: 'Ciclo activado',
  CYCLE_CLOSED: 'Ciclo cerrado',
  CYCLE_THRESHOLDS_CHANGED: 'Umbrales del ciclo cambiados',
  USER_ROLE_CHANGED: 'Rol de una persona cambiado',
  USER_DEACTIVATED: 'Persona desactivada',
  REFRESH_REUSE_DETECTED: 'Sesión cerrada por seguridad (se reusó una credencial)',
  REFRESH_REVOKED_USED: 'Intento de usar una sesión ya cerrada',
  AI_CONTENT_ADAPTED: 'Versión accesible generada con IA',
  AI_CONTENT_VALIDATED: 'Versión accesible validada por una persona',
  AI_SUGGESTION_ACCEPTED: 'Sugerencia de IA aceptada',
  ADAPTATION_REQUEST_CREATED: 'Pedido de documento adaptado creado',
  ADAPTATION_REQUEST_ASSIGNED: 'Pedido de documento adaptado asignado',
  ADAPTATION_REQUEST_DELIVERED: 'Pedido de documento adaptado entregado',
  ADAPTATION_REQUEST_REJECTED: 'Pedido de documento adaptado rechazado',
  USER_PASSWORD_CHANGED: 'Cambio de contraseña',
  ASSISTANT_PLAN_CONFIRMED: 'Plan del asistente confirmado',
  ASSISTANT_PLAN_DISCARDED: 'Plan del asistente descartado',
  ASSISTANT_ACTION_EXECUTED: 'Acción del asistente ejecutada',
  ASSISTANT_ACTION_FAILED: 'Acción del asistente fallida',
};

export const ACTIONS = Object.keys(ACTION_LABEL) as AuditAction[];
export const isAuditAction = (value: unknown): value is AuditAction =>
  typeof value === 'string' && value in ACTION_LABEL;

/** Tipos de entidad que hoy escribe el back en el AuditLog. */
export const ENTITY_LABEL: Record<string, string> = {
  Objective: 'Objetivo',
  KeyResult: 'Resultado clave',
  Cycle: 'Ciclo',
  User: 'Persona',
  AdaptedContent: 'Versión accesible',
  AiSuggestion: 'Sugerencia de IA',
  AdaptationRequest: 'Pedido de documento adaptado',
  AssistantPlan: 'Plan del asistente',
  Team: 'Equipo',
};

export const entityLabel = (type: string): string => ENTITY_LABEL[type] ?? 'Otro elemento';

/**
 * Campos que la pantalla muestra, con su etiqueta. LISTA PERMITIDA: cualquier otra clave (ids técnicos,
 * trazas, versiones de prompt y, por si algún día aparece, texto libre) no se muestra nunca.
 */
export const FIELD_LABEL: Record<string, string> = {
  status: 'Estado',
  role: 'Rol',
  active: 'Activa',
  score: 'Puntaje',
  value: 'Valor',
  startValue: 'Inicio',
  targetValue: 'Meta',
  committedThreshold: 'Umbral de comprometidos',
  aspirationalThreshold: 'Umbral de aspiracionales',
  finalScore: 'Puntaje final',
  achieved: 'Logrado',
  closedObjectives: 'Objetivos cerrados',
  achievedObjectives: 'Objetivos logrados',
  level: 'Nivel',
  humanEdited: 'Corregida por una persona',
  regenerated: 'Regenerada',
  feature: 'Función',
  assigneeId: 'Responsable',
  actionType: 'Acción',
  errorCode: 'Motivo del error',
};

/** Tipos de acción que ejecuta el asistente (campo `actionType` del registro). */
export const ASSISTANT_ACTION_LABEL: Record<string, string> = {
  CREATE_USER: 'Crear usuario',
  CREATE_TEAM: 'Crear equipo',
  SET_TEAM_MEMBER: 'Agregar al equipo o asignar líder',
  REMOVE_TEAM_MEMBER: 'Quitar del equipo',
  CREATE_CYCLE: 'Crear ciclo',
  ACTIVATE_CYCLE: 'Activar ciclo',
  CREATE_OBJECTIVE: 'Crear objetivo',
  CREATE_KEY_RESULT: 'Crear resultado clave',
  SET_KEY_RESULT_OWNER: 'Cambiar responsable de un resultado clave',
};

/** El registro lo escribió el asistente en nombre de una persona de administración. */
export function isViaAssistant(entry: Pick<AuditEntry, 'after'>): boolean {
  const after = entry.after;
  return (
    typeof after === 'object' &&
    after !== null &&
    !Array.isArray(after) &&
    (after as Record<string, unknown>).via === 'assistant'
  );
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicado',
  CLOSED: 'Cerrado',
  ACTIVE: 'Activo',
  ACCEPTED: 'Aceptada',
  VALIDATED: 'Validada',
  NEEDS_REVIEW: 'Requiere revisión',
  PENDIENTE: 'Pendiente',
  EN_CURSO: 'En curso',
  ENTREGADA: 'Entregada',
  RECHAZADA: 'Rechazada',
};

const LEVEL_LABEL: Record<string, string> = { EASY_READ: 'Lectura fácil', PLAIN: 'Lenguaje claro' };

export const NO_VALUE = 'Sin dato';
export const UNKNOWN_PERSON = 'Persona no disponible';

export type Change = { field: string; label: string; before: string | null; after: string | null };

type Ctx = { people: ReadonlyMap<string, string> };

function show(field: string, raw: unknown, ctx: Ctx): string {
  if (raw === null || raw === undefined) return NO_VALUE;
  if (typeof raw === 'boolean') return raw ? 'Sí' : 'No';
  switch (field) {
    case 'status':
      return STATUS_LABEL[String(raw)] ?? String(raw);
    case 'role':
      return (ROLE_LABEL as Record<string, string>)[String(raw)] ?? String(raw);
    case 'level':
      return LEVEL_LABEL[String(raw)] ?? String(raw);
    case 'feature':
      return FEATURE_LABEL[String(raw)] ?? String(raw);
    case 'actionType':
      return ASSISTANT_ACTION_LABEL[String(raw)] ?? String(raw);
    case 'assigneeId':
      return ctx.people.get(String(raw)) ?? UNKNOWN_PERSON;
    case 'score':
    case 'finalScore':
    case 'committedThreshold':
    case 'aspirationalThreshold':
      return Number.isFinite(Number(raw)) ? formatScore(Number(raw)) : String(raw);
    case 'value':
    case 'startValue':
    case 'targetValue':
    case 'closedObjectives':
    case 'achievedObjectives':
      return Number.isFinite(Number(raw))
        ? formatNumber(Number(raw), Number.isInteger(Number(raw)) ? 0 : 2)
        : String(raw);
    default:
      return typeof raw === 'object' ? NO_VALUE : String(raw);
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Cambios legibles de una entrada: solo campos permitidos y solo los que cambian (o aparecen/desaparecen).
 * Un registro sobre feedback (no debería existir) nunca muestra detalle.
 */
export function describeChanges(
  entry: Pick<AuditEntry, 'entityType' | 'before' | 'after'>,
  ctx: Ctx = { people: new Map() },
): Change[] {
  if (/feedback/i.test(entry.entityType)) return [];
  const before = isRecord(entry.before) ? entry.before : {};
  const after = isRecord(entry.after) ? entry.after : {};
  const changes: Change[] = [];
  for (const field of Object.keys(FIELD_LABEL)) {
    const hasBefore = field in before;
    const hasAfter = field in after;
    if (!hasBefore && !hasAfter) continue;
    const b = hasBefore ? show(field, before[field], ctx) : null;
    const a = hasAfter ? show(field, after[field], ctx) : null;
    if (b !== null && a !== null && b === a) continue;
    changes.push({ field, label: FIELD_LABEL[field], before: b, after: a });
  }
  return changes;
}

/** "18/10/2026 · 15:04" en hora de Buenos Aires. */
export const formatWhen = (iso: string): string => `${formatDate(iso)} · ${formatTime(iso)}`;

/** Quién hizo la acción. `actorId` nulo = la persona fue eliminada del sistema. */
export function actorLabel(actorId: string | null, people: ReadonlyMap<string, string>): string {
  if (actorId === null) return 'Usuario eliminado';
  return people.get(actorId) ?? UNKNOWN_PERSON;
}

/** `YYYY-MM-DD` válido (calendario real) o `undefined`. */
export function parseDay(raw: string | undefined): string | undefined {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const d = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw ? undefined : raw;
}

/** Inicio / fin del día argentino (UTC-3, sin horario de verano) como ISO para el back. */
export const dayStartIso = (day: string): string => new Date(`${day}T00:00:00-03:00`).toISOString();
export const dayEndIso = (day: string): string =>
  new Date(`${day}T23:59:59.999-03:00`).toISOString();
