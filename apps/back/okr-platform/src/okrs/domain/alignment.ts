import { err, ok, type Result } from '../../common/domain/result';

export interface AlignmentInput {
  /** Objetivo que se alinea (undefined al crear). */
  objectiveId?: string;
  parentId: string;
  parentStatus: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  /** Ancestros del padre (padre del padre, etc.), sin incluir al padre. */
  parentAncestorIds: string[];
}

/**
 * REQ-ALN-1: el padre puede estar en otro ciclo/nivel, pero no puede ser el propio objetivo,
 * no puede cerrar un ciclo en el árbol de alineación y debe estar PUBLISHED.
 */
export function validateAlignment(input: AlignmentInput): Result<void> {
  const { objectiveId, parentId, parentStatus, parentAncestorIds } = input;
  if (objectiveId !== undefined) {
    if (parentId === objectiveId)
      return err('ALIGNMENT_SELF_PARENT', 'Un objetivo no puede alinearse consigo mismo');
    if (parentAncestorIds.includes(objectiveId))
      return err('ALIGNMENT_CYCLE', 'La alineación crearía un ciclo en el árbol de objetivos');
  }
  if (parentStatus !== 'PUBLISHED')
    return err('ALIGNMENT_PARENT_NOT_PUBLISHED', 'Solo se puede alinear a un objetivo PUBLISHED');
  return ok();
}
