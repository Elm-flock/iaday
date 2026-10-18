/** Retención (RGPD art. 5.1.c y 5.1.e): el texto del chat puede tener datos personales. */
export const MESSAGE_RETENTION_DAYS = 30;
export const PLAN_RETENTION_DAYS = 90;
/** La purga perezosa corre como mucho una vez por hora por proceso. */
export const PURGE_MIN_INTERVAL_MS = 60 * 60_000;

const DAY_MS = 86_400_000;

export function retentionCutoffs(now: Date): { messagesBefore: Date; plansBefore: Date } {
  return {
    messagesBefore: new Date(now.getTime() - MESSAGE_RETENTION_DAYS * DAY_MS),
    plansBefore: new Date(now.getTime() - PLAN_RETENTION_DAYS * DAY_MS),
  };
}

export function shouldPurge(lastPurgeAt: number | null, now: Date, force = false): boolean {
  return force || lastPurgeAt === null || now.getTime() - lastPurgeAt >= PURGE_MIN_INTERVAL_MS;
}
