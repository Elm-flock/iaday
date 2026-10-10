import { err, ok, type Result } from '../../common/domain/result';

export const MAX_OBJECTIVES_PER_OWNER = 5;
export const MIN_OBJECTIVES_TO_PUBLISH = 3;
export const MAX_KRS_PER_OBJECTIVE = 5;
export const MIN_KRS_TO_PUBLISH = 3;

/** `ownerActiveCount` = objetivos DRAFT + PUBLISHED del owner en el ciclo (CLOSED no cuenta). */
export function canCreateObjective(ownerActiveCount: number): Result<void> {
  return ownerActiveCount >= MAX_OBJECTIVES_PER_OWNER
    ? err(
        'OBJECTIVE_LIMIT_EXCEEDED',
        `Máximo ${MAX_OBJECTIVES_PER_OWNER} objetivos por owner y ciclo`,
      )
    : ok();
}

export function canAddKeyResult(krCount: number): Result<void> {
  return krCount >= MAX_KRS_PER_OBJECTIVE
    ? err('KR_LIMIT_EXCEEDED', `Máximo ${MAX_KRS_PER_OBJECTIVE} KRs por objetivo`)
    : ok();
}

/** `ownerObjectiveCount` incluye al objetivo que se publica. */
export function validatePublish(input: {
  ownerObjectiveCount: number;
  krCount: number;
}): Result<void> {
  const { ownerObjectiveCount, krCount } = input;
  if (ownerObjectiveCount > MAX_OBJECTIVES_PER_OWNER)
    return err(
      'OBJECTIVE_LIMIT_EXCEEDED',
      `Máximo ${MAX_OBJECTIVES_PER_OWNER} objetivos por owner y ciclo`,
    );
  if (ownerObjectiveCount < MIN_OBJECTIVES_TO_PUBLISH)
    return err(
      'MIN_OBJECTIVES_NOT_MET',
      `Se requieren al menos ${MIN_OBJECTIVES_TO_PUBLISH} objetivos para publicar`,
    );
  if (krCount > MAX_KRS_PER_OBJECTIVE)
    return err('KR_LIMIT_EXCEEDED', `Máximo ${MAX_KRS_PER_OBJECTIVE} KRs por objetivo`);
  if (krCount < MIN_KRS_TO_PUBLISH)
    return err('MIN_KRS_NOT_MET', `Se requieren al menos ${MIN_KRS_TO_PUBLISH} KRs para publicar`);
  return ok();
}
