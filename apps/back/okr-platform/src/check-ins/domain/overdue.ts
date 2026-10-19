export type CheckInCadence = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

const DAY_MS = 86_400_000;
export const CADENCE_DAYS: Record<CheckInCadence, number> = {
  WEEKLY: 7,
  BIWEEKLY: 14,
  MONTHLY: 30,
};

/**
 * Vencido si pasó ESTRICTAMENTE más de la cadencia desde el último check-in
 * (o desde la publicación si no hay). Si se informa el estado del objetivo,
 * solo los PUBLISHED pueden vencer.
 */
export function isCheckInOverdue(
  lastCheckInAt: Date | null,
  publishedAt: Date,
  cadence: CheckInCadence,
  now: Date,
  objectiveStatus?: 'DRAFT' | 'PUBLISHED' | 'CLOSED',
): boolean {
  if (objectiveStatus !== undefined && objectiveStatus !== 'PUBLISHED') return false;
  const reference = lastCheckInAt ?? publishedAt;
  return now.getTime() - reference.getTime() > CADENCE_DAYS[cadence] * DAY_MS;
}
