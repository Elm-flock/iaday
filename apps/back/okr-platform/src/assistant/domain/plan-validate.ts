import {
  ACTION_SPECS,
  ACTION_TYPES,
  HANDLE_PATTERN,
  MAX_ACTIONS,
  REF_PATTERN,
  type ActionType,
  type HandleKind,
  type RawAction,
  type RawPlan,
  type RawRef,
} from './plan-schema';
import { isQuoteGrounded, normalizeText } from './text';

/** Límites de dominio replicados de okrs/domain/limits.ts (se comparan en un test para que no diverjan). */
export const PLAN_LIMITS = { maxObjectivesPerOwner: 5, maxKrsPerObjective: 5, minToPublish: 3 };

export interface HandleInfo {
  id: string;
  label: string;
  /** Estado de ciclos (DRAFT/ACTIVE/CLOSED) y objetivos (DRAFT/PUBLISHED). */
  status?: string;
}

export interface ValidationContext {
  /** handle -> entidad real del pedido (catálogo enviado al agente). */
  handles: Record<string, HandleInfo>;
  /** Mensajes de la persona ADMIN del turno actual y de los 3 anteriores. */
  adminTexts: string[];
  /** Emails (en minúsculas) de los usuarios existentes que coinciden con los del plan. */
  takenEmails: ReadonlySet<string>;
  existingTeams: { name: string; parentId: string | null }[];
  /** Objetivos DRAFT+PUBLISHED por `${cycleId}|U|${userId}` o `${cycleId}|T|${teamId}`. */
  objectiveCounts: Record<string, number>;
  /** KRs actuales por objetivo (uuid). */
  krCounts: Record<string, number>;
  catalogTruncated: boolean;
}

export interface PlanIssue {
  actionIndex: number | null;
  code: string;
  message: string;
}
export type PlanWarning = PlanIssue;

export type ResolvedRef =
  { kind: 'EXISTING'; id: string; label: string } | { kind: 'NEW'; ref: string; label: string };

export interface ResolvedAction {
  index: number;
  type: string;
  ref: string | null;
  sourceQuote: string;
  /** Valores escalares (nombre, email, rol, fechas...). Nunca contraseñas. */
  params: Record<string, unknown>;
  refs: Record<string, ResolvedRef>;
  /** Etiqueta legible en español para mostrar la acción (sin UUIDs). */
  description: string;
}

export interface ResolvedPlan {
  summary: string;
  assumptions: string[];
  actions: ResolvedAction[];
}

export interface PlanValidation {
  plan: ResolvedPlan;
  issues: PlanIssue[];
  warnings: PlanWarning[];
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administración',
  LEADER: 'Líder',
  MEMBER: 'Integrante',
};
const KIND_LABEL: Record<string, string> = { ANNUAL: 'anual', QUARTER: 'trimestral' };

/** Texto de un parámetro escalar del plan; cualquier otra cosa (objeto, null) queda vacía. */
const text = (v: unknown): string =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';

const isActionType = (t: string): t is ActionType =>
  (ACTION_TYPES as readonly string[]).includes(t);

/**
 * Valida y resuelve un plan del agente. NO confía en nada de lo que dijo el agente: whitelist, handles,
 * refs, anclaje (`sourceQuote`), duplicados y límites de dominio. Devuelve igualmente el plan resuelto
 * "en lo posible" para poder mostrar un plan INVALID con sus motivos.
 */
export function validatePlan(raw: RawPlan, ctx: ValidationContext): PlanValidation {
  const issues: PlanIssue[] = [];
  const warnings: PlanWarning[] = [];
  const actions: ResolvedAction[] = [];
  const issue = (i: number | null, code: string, message: string) =>
    issues.push({ actionIndex: i, code, message });

  if (raw.actions.length > MAX_ACTIONS) {
    issue(
      null,
      'TOO_MANY_ACTIONS',
      `El plan tiene ${raw.actions.length} pasos y el máximo es ${MAX_ACTIONS}. Pedilo en partes.`,
    );
  }

  // ref -> { kind, label, key } de las entidades que el plan crea (en orden).
  const defined = new Map<string, { kind: HandleKind; label: string; key: string }>();
  const plannedEmails = new Set<string>();
  const plannedTeams = new Set<string>();
  const plannedObjectivesByOwner = new Map<string, number>();
  const plannedKrsByObjective = new Map<string, number>();
  const activatedCycles = new Set<string>();
  const objectiveMeta: { index: number; ownerKey: string; objectiveKey: string }[] = [];

  raw.actions.forEach((a, index) => {
    const type = a.type;
    if (!isActionType(type)) {
      issue(
        index,
        'UNKNOWN_ACTION',
        `La acción "${type || '(vacía)'}" no está permitida para el asistente.`,
      );
      actions.push({
        index,
        type,
        ref: a.ref,
        sourceQuote: a.sourceQuote,
        params: {},
        refs: {},
        description: 'Acción no permitida',
      });
      return;
    }
    const spec = ACTION_SPECS[type];
    for (const problem of a.shapeProblems) issue(index, 'DTO_INVALID', problem);

    // Anclaje: cada acción tiene que estar justificada por algo que escribió la persona.
    if (a.sourceQuote.length < 3 || a.sourceQuote.length > 200) {
      issue(index, 'UNGROUNDED', 'La acción no cita lo que pediste (cita de 3 a 200 caracteres).');
    } else if (!isQuoteGrounded(a.sourceQuote, ctx.adminTexts)) {
      issue(index, 'UNGROUNDED', 'Esta acción no se corresponde con lo que escribiste en el chat.');
    }

    // ref: obligatorio en CREATE_*, prohibido en el resto, único.
    if (spec.creates) {
      if (!a.ref || !REF_PATTERN.test(a.ref)) {
        issue(index, 'DTO_INVALID', 'Falta el identificador interno ("ref") de lo que se crea.');
      } else if (defined.has(a.ref)) {
        issue(index, 'DUPLICATE_REF', `El identificador "${a.ref}" está repetido en el plan.`);
      }
    } else if (a.ref !== null) {
      issue(index, 'DTO_INVALID', 'Esta acción no crea nada y no lleva identificador interno.');
    }

    const refs: Record<string, ResolvedRef> = {};
    const keys: Record<string, string> = {};
    for (const [field, def] of Object.entries(spec.refs)) {
      const r = a.refs[field];
      if (!r) continue;
      const resolved = resolveRef(
        r,
        def.kind,
        def.existingOnly === true,
        field,
        index,
        ctx,
        defined,
        issue,
      );
      if (resolved) {
        refs[field] = resolved.ref;
        keys[field] = resolved.key;
      }
    }

    // Reglas específicas.
    const params = { ...a.scalars };
    const label = (f: string, fallback = '(sin definir)') => refs[f]?.label ?? fallback;
    let description = '';
    switch (type) {
      case 'CREATE_USER': {
        const email = text(params.email).trim().toLowerCase();
        const role = typeof params.role === 'string' ? params.role : 'MEMBER';
        params.role = role;
        if (email) {
          if (ctx.takenEmails.has(email) || plannedEmails.has(email)) {
            issue(
              index,
              'EMAIL_TAKEN',
              `Ya hay un usuario con el email ${email} (o se repite en el plan).`,
            );
          }
          plannedEmails.add(email);
        }
        if (role === 'ADMIN') {
          warnings.push({
            actionIndex: index,
            code: 'CREATES_ADMIN',
            message: `Vas a dar de alta a ${text(params.name)} con rol Administración: tendrá acceso total.`,
          });
        }
        description = `Crear el usuario ${text(params.name)} (${email}) con rol ${ROLE_LABEL[role] ?? role}`;
        break;
      }
      case 'CREATE_TEAM': {
        const name = normalizeText(text(params.name));
        const parentKey = keys.parent ?? '';
        const parentId = refs.parent?.kind === 'EXISTING' ? refs.parent.id : null;
        const dup =
          ctx.existingTeams.some(
            (t) => t.parentId === parentId && parentId !== null && normalizeText(t.name) === name,
          ) || plannedTeams.has(`${parentKey}|${name}`);
        if (name && dup) {
          issue(
            index,
            'TEAM_NAME_TAKEN',
            `Ya existe un equipo "${String(params.name)}" dentro de ${label('parent')}.`,
          );
        }
        plannedTeams.add(`${parentKey}|${name}`);
        description = `Crear el equipo "${text(params.name)}" dentro de ${label('parent')}`;
        break;
      }
      case 'SET_TEAM_MEMBER':
        description =
          params.isLead === true
            ? `Poner a ${label('user')} como líder del equipo ${label('team')}`
            : `Agregar a ${label('user')} al equipo ${label('team')}`;
        break;
      case 'REMOVE_TEAM_MEMBER':
        warnings.push({
          actionIndex: index,
          code: 'REMOVES_MEMBER',
          message: `Vas a quitar a ${label('user')} del equipo ${label('team')}.`,
        });
        description = `Quitar a ${label('user')} del equipo ${label('team')}`;
        break;
      case 'CREATE_CYCLE':
        description = `Crear el ciclo "${text(params.name)}" (${KIND_LABEL[String(params.kind)] ?? text(params.kind)}, del ${text(params.startDate)} al ${text(params.endDate)})`;
        break;
      case 'ACTIVATE_CYCLE': {
        const cycle = a.refs.cycle;
        const info =
          cycle?.kind === 'EXISTING' && refs.cycle ? ctx.handles[cycle.handle] : undefined;
        if (info && info.status !== 'DRAFT') {
          issue(
            index,
            'CYCLE_NOT_EDITABLE',
            `El ciclo ${info.label} no está en borrador, no se puede activar.`,
          );
        }
        if (keys.cycle) {
          if (activatedCycles.has(keys.cycle)) {
            issue(
              index,
              'CYCLE_NOT_EDITABLE',
              `El ciclo ${label('cycle')} ya se activa en un paso anterior.`,
            );
          }
          activatedCycles.add(keys.cycle);
        }
        warnings.push({
          actionIndex: index,
          code: 'ACTIVATES_CYCLE',
          message: `Vas a activar el ciclo ${label('cycle')}: desde ahí se pueden publicar objetivos.`,
        });
        description = `Activar el ciclo ${label('cycle')}`;
        break;
      }
      case 'CREATE_OBJECTIVE': {
        const cycleRaw = a.refs.cycle;
        const cycleInfo =
          cycleRaw?.kind === 'EXISTING' && refs.cycle ? ctx.handles[cycleRaw.handle] : undefined;
        if (cycleInfo?.status === 'CLOSED') {
          issue(index, 'CYCLE_NOT_EDITABLE', `El ciclo ${cycleInfo.label} está cerrado.`);
        }
        const ownerField = refs.ownerUser ? 'ownerUser' : refs.ownerTeam ? 'ownerTeam' : null;
        if (a.refs.ownerUser && a.refs.ownerTeam) {
          issue(
            index,
            'DTO_INVALID',
            'El objetivo tiene que tener un solo responsable: usuario o equipo.',
          );
        }
        const ownerKey = ownerField
          ? `${keys.cycle ?? ''}|${ownerField === 'ownerUser' ? 'U' : 'T'}|${keys[ownerField]}`
          : '';
        if (ownerKey && keys.cycle) {
          // Si ciclo y owner son existentes la clave coincide con la de `objectiveCounts`.
          const existing = ctx.objectiveCounts[ownerKey] ?? 0;
          const planned = plannedObjectivesByOwner.get(ownerKey) ?? 0;
          if (existing + planned >= PLAN_LIMITS.maxObjectivesPerOwner) {
            issue(
              index,
              'OBJECTIVE_LIMIT',
              `${label(ownerField!)} superaría ${PLAN_LIMITS.maxObjectivesPerOwner} objetivos en ${label('cycle')}.`,
            );
          }
          plannedObjectivesByOwner.set(ownerKey, planned + 1);
        }
        const parent = a.refs.parentObjective;
        if (parent) {
          const pInfo =
            parent.kind === 'EXISTING' && refs.parentObjective
              ? ctx.handles[parent.handle]
              : undefined;
          if (pInfo && pInfo.status !== 'PUBLISHED') {
            issue(
              index,
              'PARENT_NOT_PUBLISHED',
              `El objetivo ${pInfo.label} todavía no está publicado: no se puede alinear a él.`,
            );
          }
        }
        objectiveMeta.push({ index, ownerKey, objectiveKey: a.ref ?? `#${index}` });
        description = `Crear el objetivo "${text(params.title)}" en ${label('cycle')} para ${ownerField ? label(ownerField) : '(sin responsable)'}`;
        break;
      }
      case 'CREATE_KEY_RESULT': {
        const objectiveKey = keys.objective;
        if (objectiveKey) {
          const objRef = refs.objective;
          const existing = objRef?.kind === 'EXISTING' ? (ctx.krCounts[objRef.id] ?? 0) : 0;
          const planned = plannedKrsByObjective.get(objectiveKey) ?? 0;
          if (existing + planned >= PLAN_LIMITS.maxKrsPerObjective) {
            issue(
              index,
              'KR_LIMIT',
              `El objetivo ${label('objective')} superaría ${PLAN_LIMITS.maxKrsPerObjective} resultados clave.`,
            );
          }
          plannedKrsByObjective.set(objectiveKey, planned + 1);
        }
        description = `Crear el resultado clave "${text(params.title)}" en ${label('objective')}, a cargo de ${label('owner')}`;
        break;
      }
      case 'SET_KEY_RESULT_OWNER':
        description = `Cambiar el responsable de ${label('keyResult')} a ${label('owner')}`;
        break;
    }

    // Registrar lo que crea esta acción (para refs posteriores), aun si hubo problemas.
    if (spec.creates && a.ref && REF_PATTERN.test(a.ref) && !defined.has(a.ref)) {
      const createdLabel = text(params.name ?? params.title ?? a.ref);
      defined.set(a.ref, { kind: spec.creates, label: createdLabel, key: `new:${a.ref}` });
    }

    actions.push({
      index,
      type,
      ref: a.ref,
      sourceQuote: a.sourceQuote,
      params,
      refs,
      description,
    });
  });

  // Avisos no bloqueantes: objetivos que quedarán sin poder publicarse.
  for (const meta of objectiveMeta) {
    const krs = plannedKrsByObjective.get(`new:${meta.objectiveKey}`) ?? 0;
    const ownerTotal = meta.ownerKey ? (plannedObjectivesByOwner.get(meta.ownerKey) ?? 0) : 0;
    // El conteo previo de objetivos del owner se suma si es EXISTING (ya validado arriba); acá solo avisamos.
    const ownerKnown = ownerExistingCount(meta.ownerKey, ctx);
    if (krs < PLAN_LIMITS.minToPublish || ownerKnown + ownerTotal < PLAN_LIMITS.minToPublish) {
      warnings.push({
        actionIndex: meta.index,
        code: 'WILL_NOT_BE_PUBLISHABLE',
        message:
          'Este objetivo quedará en borrador: para publicarlo hacen falta al menos 3 resultados clave y que su responsable tenga al menos 3 objetivos en el ciclo.',
      });
    }
  }
  if (ctx.catalogTruncated) {
    warnings.push({
      actionIndex: null,
      code: 'CATALOG_TRUNCATED',
      message: 'La organización es grande y el asistente solo ve una parte. Revisá bien el plan.',
    });
  }

  return {
    plan: { summary: raw.summary, assumptions: raw.assumptions, actions },
    issues,
    warnings,
  };
}

function ownerExistingCount(ownerKey: string, ctx: ValidationContext): number {
  // ownerKey = `${cycleKey}|U|${ownerKey}`; solo hay conteo previo cuando ciclo y owner son EXISTING (uuid).
  return ctx.objectiveCounts[ownerKey] ?? 0;
}

function resolveRef(
  r: RawRef,
  expected: HandleKind,
  existingOnly: boolean,
  field: string,
  index: number,
  ctx: ValidationContext,
  defined: Map<string, { kind: HandleKind; label: string; key: string }>,
  issue: (i: number | null, code: string, message: string) => void,
): { ref: ResolvedRef; key: string } | null {
  if (r.kind === 'EXISTING') {
    const info =
      HANDLE_PATTERN.test(r.handle) && r.handle[0] === expected ? ctx.handles[r.handle] : undefined;
    if (!info) {
      issue(
        index,
        'UNKNOWN_HANDLE',
        `La referencia "${r.handle}" (${field}) no existe o no es del tipo esperado.`,
      );
      return null;
    }
    return { ref: { kind: 'EXISTING', id: info.id, label: info.label }, key: info.id };
  }
  if (existingOnly) {
    issue(
      index,
      'UNKNOWN_REF',
      `"${field}" tiene que ser algo que ya existe, no algo que se crea en este plan.`,
    );
    return null;
  }
  const made = defined.get(r.ref);
  if (!made || made.kind !== expected) {
    issue(
      index,
      'UNKNOWN_REF',
      `La referencia "${r.ref}" (${field}) no está definida antes en el plan o es de otro tipo.`,
    );
    return null;
  }
  return { ref: { kind: 'NEW', ref: r.ref, label: made.label }, key: made.key };
}

export type { RawAction };
