import {
  CADENCE_DAYS,
  isCheckInOverdue,
  type CheckInCadence,
} from '../../check-ins/domain/overdue';
import { MIN_KRS_TO_PUBLISH, MIN_OBJECTIVES_TO_PUBLISH } from '../../okrs/domain/limits';

const DAY_MS = 86_400_000;
export const ENDING_SOON_DAYS = 14;
export const SENSITIVE_WINDOW_HOURS = 72;
export const EXAMPLES_MAX = 5;

export const SENSITIVE_ACTIONS = [
  'USER_ROLE_CHANGED',
  'USER_DEACTIVATED',
  'KR_TARGET_CHANGED',
  'CYCLE_THRESHOLDS_CHANGED',
] as const;
export type SensitiveAction = (typeof SENSITIVE_ACTIONS)[number];

/** Filas ya leídas de la base (el servicio las arma); acá solo hay cálculo puro. */
export interface DigestInput {
  now: Date;
  /** YYYY-MM-DD en la zona de la organización. */
  today: string;
  /** KRs de ciclos no cerrados. */
  krs: {
    krTitle: string;
    objectiveTitle: string;
    ownerName: string;
    objectiveStatus: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
    publishedAt: Date | null;
    lastCheckInAt: Date | null;
    cadence: CheckInCadence;
    lastBand: 'RED' | 'YELLOW' | 'GREEN' | null;
  }[];
  cycles: { name: string; status: 'DRAFT' | 'ACTIVE' | 'CLOSED'; endDate: Date }[];
  /** Objetivos DRAFT de ciclos ACTIVE. */
  drafts: {
    objectiveTitle: string;
    ownerName: string;
    krCount: number;
    ownerObjectiveCount: number;
  }[];
  usersWithoutTeam: { userName: string }[];
  teamsWithoutLead: { teamName: string }[];
  adaptationsNeedingReview: number;
  /** Solicitudes abiertas (PENDIENTE / EN_CURSO). Sin persona solicitante ni texto del pedido. */
  adaptationRequests: {
    dueDate: Date;
    assigned: boolean;
    entityKind: string;
    preferredFormat: string;
  }[];
  sensitiveChanges: {
    action: SensitiveAction;
    actorName: string;
    entityLabel: string;
    at: Date;
  }[];
}

export interface Examples<T> {
  count: number;
  examples: T[];
}

export interface DigestFacts {
  overdueCheckIns: Examples<{
    krTitle: string;
    objectiveTitle: string;
    ownerName: string;
    daysOverdue: number;
  }>;
  krsInRed: Examples<{ krTitle: string; objectiveTitle: string; ownerName: string }>;
  cyclesEndingSoon: Examples<{ cycleName: string; endDate: string; daysLeft: number }>;
  cyclesToClose: Examples<{ cycleName: string; endDate: string; daysPast: number }>;
  draftsNotPublishable: Examples<{
    objectiveTitle: string;
    ownerName: string;
    krCount: number;
    ownerObjectiveCount: number;
  }>;
  usersWithoutTeam: Examples<{ userName: string }>;
  teamsWithoutLead: Examples<{ teamName: string }>;
  adaptationsNeedingReview: { count: number };
  adaptationRequestsOpen: {
    count: number;
    overdueCount: number;
    unassignedCount: number;
    examples: { entityKind: string; preferredFormat: string; dueDate: string; daysLeft: number }[];
  };
  recentSensitiveChanges: Examples<{
    action: SensitiveAction;
    actorName: string;
    entityLabel: string;
    at: string;
  }>;
}

export type FactKey = keyof DigestFacts;

/** Orden de prioridad de las novedades (plazo legal del art. 14.5 y ciclos a cerrar primero). */
export const FACT_PRIORITY: readonly FactKey[] = [
  'cyclesToClose',
  'adaptationRequestsOpen',
  'overdueCheckIns',
  'krsInRed',
  'cyclesEndingSoon',
  'draftsNotPublishable',
  'usersWithoutTeam',
  'teamsWithoutLead',
  'adaptationsNeedingReview',
  'recentSensitiveChanges',
];

export function factCount(facts: DigestFacts, key: FactKey): number {
  return facts[key].count;
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);
const dayStart = (iso: string): number => Date.parse(`${iso}T00:00:00.000Z`);

/** Fecha YYYY-MM-DD de `now` en la zona horaria dada (la de la organización). */
export function todayInZone(now: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    return /^\d{4}-\d{2}-\d{2}$/.test(parts) ? parts : isoDate(now);
  } catch {
    return isoDate(now);
  }
}

const top = <T>(items: T[]): T[] => items.slice(0, EXAMPLES_MAX);

/** Hechos del digest: cálculo determinista. Nunca incluye feedback ni la persona que pidió un documento adaptado. */
export function computeDigestFacts(input: DigestInput): DigestFacts {
  const { now, today } = input;
  const todayMs = dayStart(today);

  const overdue = input.krs
    .filter(
      (k) =>
        k.publishedAt !== null &&
        isCheckInOverdue(k.lastCheckInAt, k.publishedAt, k.cadence, now, k.objectiveStatus),
    )
    .map((k) => {
      const reference = (k.lastCheckInAt ?? k.publishedAt) as Date;
      const dueAt = reference.getTime() + CADENCE_DAYS[k.cadence] * DAY_MS;
      return {
        krTitle: k.krTitle,
        objectiveTitle: k.objectiveTitle,
        ownerName: k.ownerName,
        daysOverdue: Math.max(1, Math.floor((now.getTime() - dueAt) / DAY_MS)),
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue || a.krTitle.localeCompare(b.krTitle));

  const red = input.krs
    .filter((k) => k.objectiveStatus === 'PUBLISHED' && k.lastBand === 'RED')
    .map((k) => ({ krTitle: k.krTitle, objectiveTitle: k.objectiveTitle, ownerName: k.ownerName }))
    .sort((a, b) => a.krTitle.localeCompare(b.krTitle));

  const active = input.cycles.filter((c) => c.status === 'ACTIVE');
  const ending = active
    .map((c) => ({
      cycleName: c.name,
      endDate: isoDate(c.endDate),
      daysLeft: Math.round((c.endDate.getTime() - todayMs) / DAY_MS),
    }))
    .filter((c) => c.daysLeft >= 0 && c.daysLeft <= ENDING_SOON_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const toClose = active
    .map((c) => ({
      cycleName: c.name,
      endDate: isoDate(c.endDate),
      daysPast: Math.round((todayMs - c.endDate.getTime()) / DAY_MS),
    }))
    .filter((c) => c.daysPast > 0)
    .sort((a, b) => b.daysPast - a.daysPast);

  const drafts = input.drafts
    .filter(
      (d) => d.krCount < MIN_KRS_TO_PUBLISH || d.ownerObjectiveCount < MIN_OBJECTIVES_TO_PUBLISH,
    )
    .sort((a, b) => a.objectiveTitle.localeCompare(b.objectiveTitle));

  const reqs = input.adaptationRequests;
  const reqOverdue = reqs.filter((r) => r.dueDate.getTime() < now.getTime());
  const reqExamples = [...reqs]
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .map((r) => ({
      entityKind: r.entityKind,
      preferredFormat: r.preferredFormat,
      dueDate: isoDate(r.dueDate),
      daysLeft: Math.floor((dayStart(isoDate(r.dueDate)) - todayMs) / DAY_MS),
    }));

  const windowStart = now.getTime() - SENSITIVE_WINDOW_HOURS * 3_600_000;
  const sensitive = input.sensitiveChanges
    .filter((c) => c.at.getTime() >= windowStart)
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map((c) => ({
      action: c.action,
      actorName: c.actorName,
      entityLabel: c.entityLabel,
      at: c.at.toISOString(),
    }));

  return {
    overdueCheckIns: { count: overdue.length, examples: top(overdue) },
    krsInRed: { count: red.length, examples: top(red) },
    cyclesEndingSoon: { count: ending.length, examples: top(ending) },
    cyclesToClose: { count: toClose.length, examples: top(toClose) },
    draftsNotPublishable: { count: drafts.length, examples: top(drafts) },
    usersWithoutTeam: {
      count: input.usersWithoutTeam.length,
      examples: top(input.usersWithoutTeam),
    },
    teamsWithoutLead: {
      count: input.teamsWithoutLead.length,
      examples: top(input.teamsWithoutLead),
    },
    adaptationsNeedingReview: { count: input.adaptationsNeedingReview },
    adaptationRequestsOpen: {
      count: reqs.length,
      overdueCount: reqOverdue.length,
      unassignedCount: reqs.filter((r) => !r.assigned).length,
      examples: top(reqExamples),
    },
    recentSensitiveChanges: { count: sensitive.length, examples: top(sensitive) },
  };
}

/** Claves con novedades (count > 0), en orden de prioridad. */
export function activeFactKeys(facts: DigestFacts): FactKey[] {
  return FACT_PRIORITY.filter((k) => factCount(facts, k) > 0);
}
