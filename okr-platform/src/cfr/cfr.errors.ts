import { HttpException, HttpStatus } from '@nestjs/common';
import type { Err } from '../common/domain/result';

/**
 * Códigos de dominio de CFR (misma forma que okrDomainError: { statusCode, message, code }).
 * 400: el pedido es incoherente por sí mismo (autoenvío / autoreconocimiento).
 */
const STATUS_BY_CODE: Record<string, HttpStatus> = {
  FEEDBACK_SELF_SEND: HttpStatus.BAD_REQUEST,
  RECOGNITION_SELF: HttpStatus.BAD_REQUEST,
};

export function cfrDomainError(error: Pick<Err, 'code' | 'message'>): HttpException {
  const status = STATUS_BY_CODE[error.code] ?? HttpStatus.UNPROCESSABLE_ENTITY;
  return new HttpException(
    { statusCode: status, message: error.message, code: error.code },
    status,
  );
}
