import { HttpException, HttpStatus } from '@nestjs/common';
import type { Err } from '../common/domain/result';

/**
 * Códigos de dominio de IA -> HTTP (misma forma que okrDomainError: { statusCode, message, code }).
 * 503: la IA está apagada o no disponible (el resto de la plataforma sigue funcionando).
 * 429/422/502: reflejan el error del agente (ver docs/ai/agent-contract.md §5.1).
 * 409: conflicto con el estado de la adaptación o la sugerencia.
 * 404/403 (visibilidad y permisos) los lanzan los servicios directamente.
 */
const STATUS_BY_CODE: Record<string, HttpStatus> = {
  AI_DISABLED: HttpStatus.SERVICE_UNAVAILABLE,
  AI_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  AI_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  AI_INPUT_REJECTED: HttpStatus.UNPROCESSABLE_ENTITY,
  AI_OUTPUT_INVALID: HttpStatus.BAD_GATEWAY,
  AI_NOTHING_TO_ADAPT: HttpStatus.UNPROCESSABLE_ENTITY,
  AI_NOTHING_TO_SUMMARIZE: HttpStatus.UNPROCESSABLE_ENTITY,
  AI_VALIDATION_NOT_ALLOWED: HttpStatus.UNPROCESSABLE_ENTITY,
  AI_EDITED_CONTENT_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  AI_ADAPTATION_STATE_CONFLICT: HttpStatus.CONFLICT,
  AI_SUGGESTION_ALREADY_DECIDED: HttpStatus.CONFLICT,
  AI_ADAPTATION_NOT_FOUND: HttpStatus.NOT_FOUND,
};

export function aiDomainError(error: Pick<Err, 'code' | 'message'>): HttpException {
  const status = STATUS_BY_CODE[error.code] ?? HttpStatus.UNPROCESSABLE_ENTITY;
  return new HttpException(
    { statusCode: status, message: error.message, code: error.code },
    status,
  );
}

/** Códigos de Nest a los que se traduce un fallo del agente (agent-contract.md §5.1). */
export type AiFailureCode =
  'AI_UNAVAILABLE' | 'AI_RATE_LIMITED' | 'AI_INPUT_REJECTED' | 'AI_OUTPUT_INVALID';

const MESSAGE_BY_CODE: Record<string, string> = {
  AI_DISABLED: 'La ayuda de IA está desactivada en este entorno.',
  AI_UNAVAILABLE:
    'La ayuda de IA no está disponible ahora. El resto de la plataforma funciona normal.',
  AI_RATE_LIMITED: 'Hay muchos pedidos de IA en curso. Probá de nuevo en un momento.',
  AI_INPUT_REJECTED: 'No pudimos adaptar este texto.',
  AI_OUTPUT_INVALID: 'La IA devolvió una respuesta que no pudimos usar. Probá de nuevo.',
};

/** Traduce un fallo del agente (ya clasificado por el cliente) a la excepción HTTP de Nest. */
export function mapAgentFailure(failure: { code: AiFailureCode }): HttpException {
  return aiDomainError({
    code: failure.code,
    message: MESSAGE_BY_CODE[failure.code] ?? MESSAGE_BY_CODE.AI_UNAVAILABLE,
  });
}

export const aiDisabledError = (): HttpException =>
  aiDomainError({ code: 'AI_DISABLED', message: MESSAGE_BY_CODE.AI_DISABLED });
