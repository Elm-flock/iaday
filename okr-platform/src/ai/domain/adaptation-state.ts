import { err, ok, type Result } from '../../common/domain/result';

export type AdaptationStatus = 'DRAFT' | 'ACCEPTED' | 'VALIDATED' | 'NEEDS_REVIEW';

/** DRAFT -> ACCEPTED. Cualquier otro estado es conflicto (el estado nunca retrocede). */
export function acceptTransition(status: AdaptationStatus): Result<'ACCEPTED'> {
  return status === 'DRAFT'
    ? ok('ACCEPTED' as const)
    : err(
        'AI_ADAPTATION_STATE_CONFLICT',
        `La versión está en estado ${status} y no se puede aceptar`,
      );
}

/** DRAFT | ACCEPTED | NEEDS_REVIEW -> VALIDATED. VALIDATED es terminal. */
export function validateTransition(status: AdaptationStatus): Result<'VALIDATED'> {
  return status === 'VALIDATED'
    ? err('AI_ADAPTATION_STATE_CONFLICT', 'La versión ya fue validada')
    : ok('VALIDATED' as const);
}

interface Seg {
  key: string;
  text: string;
}

/** La corrección humana conserva las mismas claves y el mismo orden, con textos no vacíos. */
export function validateEditedSegments(existing: Seg[], edited: Seg[]): Result {
  if (edited.length !== existing.length || edited.some((s, i) => s.key !== existing[i].key)) {
    return err(
      'AI_EDITED_CONTENT_INVALID',
      'El contenido corregido debe conservar los mismos segmentos y el mismo orden',
    );
  }
  if (edited.some((s) => !s.text.trim())) {
    return err('AI_EDITED_CONTENT_INVALID', 'Ningún segmento corregido puede quedar vacío');
  }
  return ok();
}
