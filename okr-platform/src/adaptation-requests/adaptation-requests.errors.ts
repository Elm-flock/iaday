import { HttpException, HttpStatus } from '@nestjs/common';
import type { Err } from '../common/domain/result';

/**
 * Códigos de dominio de pedidos de adaptación -> HTTP (misma forma que okrDomainError).
 * 409: el pedido ya está resuelto. 422: regla de negocio (justificación, nota, responsable).
 * 403/404 (permisos y visibilidad) los lanzan los servicios directamente.
 */
const STATUS_BY_CODE: Record<string, HttpStatus> = {
  ADAPTATION_REQUEST_STATE_CONFLICT: HttpStatus.CONFLICT,
  ADAPTATION_REJECTION_JUSTIFICATION_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  ADAPTATION_DELIVERY_NOTE_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  ADAPTATION_ASSIGNEE_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
};

export function adaptationDomainError(error: Pick<Err, 'code' | 'message'>): HttpException {
  const status = STATUS_BY_CODE[error.code] ?? HttpStatus.UNPROCESSABLE_ENTITY;
  return new HttpException(
    { statusCode: status, message: error.message, code: error.code },
    status,
  );
}
