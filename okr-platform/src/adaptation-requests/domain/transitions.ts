import { err, ok, type Result } from '../../common/domain/result';

export type RequestStatus = 'PENDIENTE' | 'EN_CURSO' | 'ENTREGADA' | 'RECHAZADA';

/** Art. 14.5 RD 707/2026: la negativa se justifica por escrito; exigimos una frase con sentido, no un "no". */
export const MIN_REJECTION_LENGTH = 20;
export const MIN_DELIVERY_NOTE_LENGTH = 10;
export const DEFAULT_DUE_DAYS = 10;

const DAY_MS = 86_400_000;

/** Fecha límite: alta + N días corridos (la config trae N; fuera de rango cae en el default). */
export function computeDueDate(createdAt: Date, days: number): Date {
  const safe = Number.isInteger(days) && days > 0 ? days : DEFAULT_DUE_DAYS;
  return new Date(createdAt.getTime() + safe * DAY_MS);
}

/** Vencido: sigue abierto (PENDIENTE o EN_CURSO) y pasó la fecha límite. Los resueltos nunca vencen. */
export function isOverdue(req: { status: RequestStatus; dueDate: Date }, now: Date): boolean {
  return (req.status === 'PENDIENTE' || req.status === 'EN_CURSO') && req.dueDate < now;
}

const isOpen = (status: RequestStatus) => status === 'PENDIENTE' || status === 'EN_CURSO';

const closedConflict = (status: RequestStatus) =>
  err(
    'ADAPTATION_REQUEST_STATE_CONFLICT',
    `El pedido ya está ${status === 'ENTREGADA' ? 'entregado' : 'rechazado'} y no se puede modificar`,
  );

/** Asignar a una persona de administración toma el pedido: PENDIENTE -> EN_CURSO (reasignar mantiene EN_CURSO). */
export function assignTransition(status: RequestStatus): Result<'EN_CURSO'> {
  return isOpen(status) ? ok('EN_CURSO' as const) : closedConflict(status);
}

/** Entregar exige una nota que explique qué se entrega (y dónde). Desde PENDIENTE o EN_CURSO. */
export function deliverTransition(
  status: RequestStatus,
  note: string | undefined | null,
): Result<'ENTREGADA'> {
  if (!isOpen(status)) return closedConflict(status);
  if ((note ?? '').trim().length < MIN_DELIVERY_NOTE_LENGTH) {
    return err(
      'ADAPTATION_DELIVERY_NOTE_REQUIRED',
      `Contá qué entregás y cómo acceder a eso (al menos ${MIN_DELIVERY_NOTE_LENGTH} caracteres)`,
    );
  }
  return ok('ENTREGADA' as const);
}

/**
 * Rechazar exige justificación por escrito (art. 14.5: solo por carga desproporcionada).
 * Se valida acá (no en el DTO) para que la falta sea 422 de negocio y no un 400 de formato.
 */
export function rejectTransition(
  status: RequestStatus,
  justification: string | undefined | null,
): Result<'RECHAZADA'> {
  if (!isOpen(status)) return closedConflict(status);
  if ((justification ?? '').trim().length < MIN_REJECTION_LENGTH) {
    return err(
      'ADAPTATION_REJECTION_JUSTIFICATION_REQUIRED',
      `Para rechazar un pedido hace falta una justificación por escrito, en lenguaje claro (al menos ${MIN_REJECTION_LENGTH} caracteres)`,
    );
  }
  return ok('RECHAZADA' as const);
}

/** Solo se asigna a una persona de administración activa. */
export function validateAssignee(assignee: { role: string; active: boolean } | null): Result {
  if (!assignee) return err('ADAPTATION_ASSIGNEE_INVALID', 'La persona elegida no existe');
  if (assignee.role !== 'ADMIN' || !assignee.active) {
    return err(
      'ADAPTATION_ASSIGNEE_INVALID',
      'Solo se puede asignar a una persona de administración activa',
    );
  }
  return ok();
}

/** El vínculo a un feedback solo lo puede declarar quien lo envió o lo recibió (sin bypass de rol). */
export function canLinkFeedback(
  requesterId: string,
  fb: { fromUserId: string; toUserId: string },
): boolean {
  return requesterId === fb.fromUserId || requesterId === fb.toUserId;
}
