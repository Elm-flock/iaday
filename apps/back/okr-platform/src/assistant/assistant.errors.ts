import { HttpException, HttpStatus } from '@nestjs/common';

/** Códigos ASSISTANT_* -> HTTP (docs/ai/agent-contract-admin.md §8.3). Misma forma { statusCode, message, code }. */
const STATUS_BY_CODE: Record<string, HttpStatus> = {
  ASSISTANT_PLAN_NOT_FOUND: HttpStatus.NOT_FOUND,
  ASSISTANT_PLAN_EXPIRED: HttpStatus.GONE,
  ASSISTANT_PLAN_HASH_MISMATCH: HttpStatus.CONFLICT,
  ASSISTANT_PLAN_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  ASSISTANT_PLAN_ALREADY_DECIDED: HttpStatus.CONFLICT,
};

export const ASSISTANT_MESSAGES: Record<string, string> = {
  ASSISTANT_PLAN_NOT_FOUND: 'No encontramos ese plan.',
  ASSISTANT_PLAN_EXPIRED:
    'El plan venció (duran 15 minutos). Pedilo de nuevo y no se ejecutó nada.',
  ASSISTANT_PLAN_HASH_MISMATCH:
    'El plan cambió desde que lo viste, así que no se ejecutó nada. Volvé a cargarlo y revisalo.',
  ASSISTANT_PLAN_INVALID:
    'Este plan tiene problemas y no se puede ejecutar. Pedilo de nuevo con más detalle.',
  ASSISTANT_PLAN_ALREADY_DECIDED: 'Este plan ya se confirmó, se ejecutó o se descartó.',
};

export function assistantError(
  code: keyof typeof ASSISTANT_MESSAGES,
  extra: Record<string, unknown> = {},
): HttpException {
  const status = STATUS_BY_CODE[code] ?? HttpStatus.UNPROCESSABLE_ENTITY;
  return new HttpException(
    { statusCode: status, message: ASSISTANT_MESSAGES[code], code, ...extra },
    status,
  );
}
