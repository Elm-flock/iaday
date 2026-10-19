/**
 * Anotaciones de estado para el historial que viaja al agente y respuesta de un plan INVALID.
 * Funciones puras: sin Nest ni Prisma. El historial solo lleva nombres y etiquetas (nunca UUIDs ni emails).
 */

export interface HistoryPlanAction {
  type: string;
  description: string;
  params?: Record<string, unknown>;
}

export interface HistoryPlanStep {
  index: number;
  status: 'OK' | 'FAILED' | 'SKIPPED';
  error?: { code: string; message: string };
}

export interface HistoryPlan {
  status: string;
  summary: string;
  expiresAt: Date;
  actions: HistoryPlanAction[];
  issues: { message: string }[];
  steps: HistoryPlanStep[] | null;
}

const MAX_TEXT = 2000;
const EMAIL = /[^\s@()<>"']+@[^\s@()<>"']+\.[^\s@()<>"']+/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Quita emails y UUIDs que pudieran colarse en un mensaje de error o una descripción. */
export const scrub = (t: string): string =>
  t.replace(EMAIL, '[email]').replace(UUID, '[id]').replace(/\s+/g, ' ').trim();

const strip = (t: string): string => t.replace(/[.\s]+$/, '');

/** Descripción de un paso apta para el agente: un alta se nombra sin su email. */
function stepLabel(a: HistoryPlanAction): string {
  if (a.type === 'CREATE_USER') {
    const name = typeof a.params?.name === 'string' ? a.params.name : '';
    return name ? `Crear el usuario ${name}` : 'Crear un usuario';
  }
  return scrub(a.description);
}

const list = (items: string[]): string => items.map(strip).join('; ');

/** Texto de un plan previo en el historial, con su estado real y qué existe y qué no. */
export function describePlanForHistory(
  plan: HistoryPlan,
  now: Date,
  opts: { pendingNow?: boolean } = {},
): string {
  const labels = plan.actions.map(stepLabel);
  const summary = strip(scrub(plan.summary));
  let body: string;
  const expired = plan.status === 'PROPOSED' && now.getTime() >= plan.expiresAt.getTime();

  if (plan.status === 'PROPOSED' && !expired) {
    body = `[Plan PROPUESTO, todavía sin confirmar: nada de esto existe aún. ${summary}. Pasos: ${list(labels)}.`;
    if (opts.pendingNow) {
      body +=
        ' Sigue pendiente de confirmación ahora: si el pedido nuevo depende de esto, incluí esos pasos en el plan nuevo.';
    }
    body += ']';
  } else if (plan.status === 'EXPIRED' || expired) {
    body = `[Plan VENCIDO: no se ejecutó, nada de esto existe. ${summary}.]`;
  } else if (plan.status === 'DISCARDED') {
    body = `[Plan DESCARTADO: no se ejecutó, nada de esto existe. ${summary}.]`;
  } else if (plan.status === 'INVALID') {
    const why = plan.issues.map((i) => scrub(i.message));
    body = `[Plan INVÁLIDO: no se pudo ejecutar y nada de esto existe. ${summary}. Problemas: ${list(why)}.]`;
  } else if (plan.status === 'EXECUTING') {
    body = `[Plan EN EJECUCIÓN: todavía no hay resultado. ${summary}.]`;
  } else if (plan.status === 'INTERRUPTED') {
    body = `[Plan INTERRUMPIDO: puede haberse hecho solo una parte. ${summary}. Verificalo con una consulta antes de repetirlo.]`;
  } else if (plan.status === 'EXECUTED') {
    body = `[Plan EJECUTADO: se hizo todo y ya existe. ${summary}. Se hizo: ${list(labels)}.]`;
  } else {
    // PARTIAL / FAILED
    const steps = plan.steps ?? [];
    const done = steps.filter((s) => s.status === 'OK').map((s) => labels[s.index] ?? '');
    const failed = steps.find((s) => s.status === 'FAILED');
    const skipped = steps.filter((s) => s.status === 'SKIPPED').map((s) => labels[s.index] ?? '');
    const why = failed?.error ? ` por ${strip(scrub(failed.error.message))}` : '';
    const failedLabel = failed ? (labels[failed.index] ?? 'un paso') : 'un paso';
    if (plan.status === 'PARTIAL') {
      body =
        `[Plan PARCIAL: se hizo ${done.length > 0 ? list(done) : 'una parte'}; falló ${strip(failedLabel)}${why}` +
        `${skipped.length > 0 ? `; no se hizo ${list(skipped)}` : ''}.]`;
    } else {
      body = `[Plan FALLIDO: falló ${strip(failedLabel)}${why}. No se cambió nada.]`;
    }
  }
  return body.slice(0, MAX_TEXT);
}

const ISSUE_NEXT_STEP: Record<string, string> = {
  UNKNOWN_HANDLE:
    'si el plan dependía de algo de un plan anterior sin confirmar, confirmalo primero o pedí todo junto en un solo pedido',
  UNKNOWN_REF:
    'si el plan dependía de algo de un plan anterior sin confirmar, confirmalo primero o pedí todo junto en un solo pedido',
  UNGROUNDED: 'contame con más detalle qué querés hacer, con tus palabras',
  EMAIL_TAKEN: 'usá otro email o pedime modificar a la persona que ya existe',
  TEAM_NAME_TAKEN: 'elegí otro nombre para el equipo',
  OBJECTIVE_LIMIT: 'reducí la cantidad de objetivos (el máximo es 5 por responsable y ciclo)',
  KR_LIMIT: 'reducí la cantidad de resultados clave (el máximo es 5 por objetivo)',
  CYCLE_NOT_EDITABLE: 'elegí un ciclo en borrador o activo',
  PARENT_NOT_PUBLISHED: 'alineá a un objetivo que ya esté publicado',
  TOO_MANY_ACTIONS: 'pedilo en partes más chicas',
  DTO_INVALID:
    'revisá los datos que marca cada motivo (por ejemplo las fechas o el ciclo anual al que pertenece un trimestre) y volvé a pedirlo',
};
const DEFAULT_NEXT_STEP = 'volvé a pedirlo con más detalle';

/** Motivo en lenguaje claro para la persona: sin referencias internas ni códigos de dominio. */
function userIssueMessage(i: { code: string; message: string }): string {
  if (i.code === 'UNKNOWN_HANDLE' || i.code === 'UNKNOWN_REF') {
    return 'El plan usaba algo que todavía no existe en el sistema (por ejemplo un ciclo o un equipo de un plan anterior que no confirmaste).';
  }
  if (i.code === 'UNGROUNDED') return 'Un paso del plan no se corresponde con lo que pediste.';
  return i.message.replace(/\s*\([A-Z][A-Z_]{5,}\)\s*$/, '').trim();
}

/** Respuesta del asistente cuando el plan queda INVALID: motivos concretos y qué hacer ahora. */
export function invalidPlanReply(issues: { code: string; message: string }[]): string {
  const reasons = [...new Set(issues.map(userIssueMessage))].slice(0, 5);
  const steps = [...new Set(issues.map((i) => ISSUE_NEXT_STEP[i.code] ?? DEFAULT_NEXT_STEP))].slice(
    0,
    3,
  );
  const head = 'Preparé un plan, pero tiene problemas y no se puede ejecutar:';
  const bullets = reasons.map((r) => `- ${r}`).join('\n');
  const next = `Qué podés hacer: ${steps.join('; ')}.`;
  return `${head}\n${bullets}\n${next}`.slice(0, MAX_TEXT);
}

/** Aviso al pie de un plan nuevo cuando todavía hay otro propuesto sin confirmar. */
export function pendingPlanNote(summary: string): string {
  return `Tenés un plan anterior sin confirmar: ${strip(summary)}. Si no lo querés, descartalo antes de confirmar este.`;
}
