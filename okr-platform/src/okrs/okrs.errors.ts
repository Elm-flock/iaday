import { HttpException, HttpStatus } from '@nestjs/common';
import type { Err } from '../common/domain/result';

/**
 * Códigos de dominio de OKRs -> HTTP (misma convención que ciclos):
 * 400: el pedido es incoherente por sí mismo (alineación a sí mismo o en ciclo, score manual inválido).
 * 409: conflicto con el estado del recurso (cerrado, campos bloqueados tras publicar).
 * 422: regla de negocio (límites 3-5, mínimos para publicar, padre no publicado, KR inválido).
 * 403/404 (política y visibilidad) los lanzan los servicios directamente.
 */
const STATUS_BY_CODE: Record<string, HttpStatus> = {
  ALIGNMENT_SELF_PARENT: HttpStatus.BAD_REQUEST,
  ALIGNMENT_CYCLE: HttpStatus.BAD_REQUEST,
  INVALID_MANUAL_SCORE: HttpStatus.BAD_REQUEST,
  INVALID_KR_RANGE: HttpStatus.BAD_REQUEST,
  KR_VALUES_REQUIRED: HttpStatus.BAD_REQUEST,
  KR_VALUES_NOT_ALLOWED: HttpStatus.BAD_REQUEST,
  CHECKIN_VALUE_REQUIRED: HttpStatus.BAD_REQUEST,
  CHECKIN_VALUE_NOT_ALLOWED: HttpStatus.BAD_REQUEST,
  CHECKIN_MANUAL_SCORE_REQUIRED: HttpStatus.BAD_REQUEST,
  CHECKIN_MANUAL_SCORE_NOT_ALLOWED: HttpStatus.BAD_REQUEST,
  OBJECTIVE_CLOSED: HttpStatus.CONFLICT,
  OBJECTIVE_FIELD_LOCKED: HttpStatus.CONFLICT,
  OBJECTIVE_NOT_DRAFT: HttpStatus.CONFLICT,
  OBJECTIVE_NOT_PUBLISHED: HttpStatus.CONFLICT,
  CYCLE_CLOSED: HttpStatus.CONFLICT,
  OBJECTIVE_LIMIT_EXCEEDED: HttpStatus.UNPROCESSABLE_ENTITY,
  KR_LIMIT_EXCEEDED: HttpStatus.UNPROCESSABLE_ENTITY,
  MIN_OBJECTIVES_NOT_MET: HttpStatus.UNPROCESSABLE_ENTITY,
  MIN_KRS_NOT_MET: HttpStatus.UNPROCESSABLE_ENTITY,
  ALIGNMENT_PARENT_NOT_PUBLISHED: HttpStatus.UNPROCESSABLE_ENTITY,
  MILESTONE_NOT_REACHED: HttpStatus.UNPROCESSABLE_ENTITY,
};

export function okrDomainError(error: Pick<Err, 'code' | 'message'>): HttpException {
  const status = STATUS_BY_CODE[error.code] ?? HttpStatus.UNPROCESSABLE_ENTITY;
  return new HttpException(
    { statusCode: status, message: error.message, code: error.code },
    status,
  );
}
