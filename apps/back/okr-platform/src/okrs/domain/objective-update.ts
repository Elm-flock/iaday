import { err, ok, type Result } from '../../common/domain/result';

/** Campos editables tras publicar (el resto queda bloqueado). */
export const PUBLISHED_EDITABLE_FIELDS = ['title', 'description', 'parentObjectiveId'];

/** DRAFT: todo lo editable; PUBLISHED: título, descripción y alineación; CLOSED: nada. */
export function validateObjectiveUpdate(
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED',
  changedFields: string[],
): Result<void> {
  if (status === 'CLOSED') return err('OBJECTIVE_CLOSED', 'El objetivo está cerrado');
  if (status === 'PUBLISHED') {
    const locked = changedFields.filter((f) => !PUBLISHED_EDITABLE_FIELDS.includes(f));
    if (locked.length > 0)
      return err(
        'OBJECTIVE_FIELD_LOCKED',
        `Tras publicar solo se editan título, descripción y alineación (no: ${locked.join(', ')})`,
      );
  }
  return ok();
}
