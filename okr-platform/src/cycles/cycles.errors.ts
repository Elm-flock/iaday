import { HttpException, HttpStatus } from '@nestjs/common';
import type { Err } from '../common/domain/result';

/**
 * Códigos de dominio de ciclos -> HTTP.
 * 400: el pedido en sí es incoherente (fechas, jerarquía, umbrales; REQ-CYC-1/2).
 * 422: regla de negocio contra el estado existente (solape con hermanos, transición inválida).
 */
const STATUS_BY_CODE: Record<string, HttpStatus> = {
  INVALID_DATE_RANGE: HttpStatus.BAD_REQUEST,
  ANNUAL_CANNOT_HAVE_PARENT: HttpStatus.BAD_REQUEST,
  QUARTER_REQUIRES_ANNUAL_PARENT: HttpStatus.BAD_REQUEST,
  QUARTER_OUT_OF_PARENT_RANGE: HttpStatus.BAD_REQUEST,
  INVALID_THRESHOLD: HttpStatus.BAD_REQUEST,
  QUARTER_OVERLAPS_SIBLING: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_CYCLE_TRANSITION: HttpStatus.UNPROCESSABLE_ENTITY,
};

export function cycleDomainError(error: Err): HttpException {
  return new HttpException(
    { statusCode: STATUS_BY_CODE[error.code] ?? 422, message: error.message, code: error.code },
    STATUS_BY_CODE[error.code] ?? HttpStatus.UNPROCESSABLE_ENTITY,
  );
}
