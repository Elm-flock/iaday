import { err, ok, type Result } from '../../common/domain/result';

export const PLAN_STATUSES = [
  'PROPOSED',
  'INVALID',
  'EXECUTING',
  'EXECUTED',
  'PARTIAL',
  'FAILED',
  'INTERRUPTED',
  'DISCARDED',
  'EXPIRED',
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

const ALLOWED: Record<PlanStatus, readonly PlanStatus[]> = {
  PROPOSED: ['EXECUTING', 'DISCARDED', 'EXPIRED'],
  INVALID: [],
  EXECUTING: ['EXECUTED', 'PARTIAL', 'FAILED', 'INTERRUPTED'],
  EXECUTED: [],
  PARTIAL: [],
  FAILED: [],
  INTERRUPTED: [],
  DISCARDED: [],
  EXPIRED: [],
};

export const EXECUTING_STALE_MS = 5 * 60_000;
export const DEFAULT_PLAN_TTL_MIN = 15;

export function canTransitionPlan(from: PlanStatus, to: PlanStatus): Result {
  return ALLOWED[from].includes(to)
    ? ok()
    : err('ASSISTANT_PLAN_ALREADY_DECIDED', `El plan no puede pasar de ${from} a ${to}.`);
}

export const isExpired = (expiresAt: Date, now: Date): boolean =>
  now.getTime() >= expiresAt.getTime();

/** Un plan EXECUTING sin actividad hace más de 5 minutos quedó interrumpido (el proceso murió). */
export const isStale = (updatedAt: Date, now: Date, staleMs = EXECUTING_STALE_MS): boolean =>
  now.getTime() - updatedAt.getTime() > staleMs;

export const computeExpiry = (now: Date, ttlMin = DEFAULT_PLAN_TTL_MIN): Date =>
  new Date(now.getTime() + ttlMin * 60_000);

export type StepStatus = 'OK' | 'FAILED' | 'SKIPPED';

/** Estado final de un plan según los resultados por paso (se frena en el primer fallo). */
export function finalStatus(steps: readonly { status: StepStatus }[]): PlanStatus {
  const okCount = steps.filter((s) => s.status === 'OK').length;
  const failed = steps.some((s) => s.status === 'FAILED');
  if (!failed) return 'EXECUTED';
  return okCount > 0 ? 'PARTIAL' : 'FAILED';
}
