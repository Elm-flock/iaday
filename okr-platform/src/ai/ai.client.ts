import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import type {
  AdaptRequest,
  AdaptResponse,
  AgentErrorEnvelope,
  CheckinSummaryRequest,
  CheckinSummaryResponse,
  OkrSuggestRequest,
  OkrSuggestResponse,
  UsageStep,
} from './agent-contract.types';
import { AiConfig } from './ai.config';
import type { AiFailureCode } from './ai.errors';
import type { PromptIdentity } from './domain/adaptation-cache';

/** Fallo del agente ya traducido a código Nest; `usage` se persiste igual (LlmCall). */
export interface AgentFailure {
  code: AiFailureCode;
  /** Código original del agente, o null si ni siquiera hubo respuesta (conexión, timeout). */
  agentCode: string | null;
  usage: UsageStep[];
  retryAfterSeconds?: number;
  /** Falla de transporte (sin usage[] del agente): se persiste como LlmCall step TRANSPORT. */
  transport?: TransportFailure;
}

export type TransportErrorCode = 'AGENT_UNREACHABLE' | 'AGENT_TIMEOUT' | 'AGENT_BAD_RESPONSE';

export interface TransportFailure {
  errorCode: TransportErrorCode;
  latencyMs: number;
}

export type AgentOutcome<T> = { ok: true; data: T } | { ok: false; failure: AgentFailure };

/** HMAC-SHA256 hex sobre `"{timestamp}.{rawBody}"` (agent-contract.md §3). */
export function signBody(secret: string, timestamp: string, rawBody: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
}

const FAILURE_BY_AGENT_CODE: Record<string, AiFailureCode> = {
  RATE_LIMITED: 'AI_RATE_LIMITED',
  INPUT_REJECTED: 'AI_INPUT_REJECTED',
  OUTPUT_INVALID: 'AI_OUTPUT_INVALID',
  // Resto (MODEL_UNAVAILABLE, INTERNAL, UNAUTHORIZED, INVALID_REQUEST): AI_UNAVAILABLE.
};

/**
 * Cliente HTTP del agente. Serializa el body UNA vez y firma esos mismos bytes.
 * Nunca lanza: devuelve `AgentOutcome` para que el servicio persista `usage[]` aun en errores.
 */
@Injectable()
export class AiClient {
  private readonly logger = new Logger(AiClient.name);

  constructor(private readonly config: AiConfig) {}

  adapt(body: AdaptRequest, traceId: string): Promise<AgentOutcome<AdaptResponse>> {
    return this.post<AdaptResponse>('/v1/adapt', body, traceId);
  }

  okrSuggest(body: OkrSuggestRequest, traceId: string): Promise<AgentOutcome<OkrSuggestResponse>> {
    return this.post<OkrSuggestResponse>('/v1/okr-suggest', body, traceId);
  }

  checkinSummary(
    body: CheckinSummaryRequest,
    traceId: string,
  ): Promise<AgentOutcome<CheckinSummaryResponse>> {
    return this.post<CheckinSummaryResponse>('/v1/checkin-summary', body, traceId);
  }

  /**
   * Llamada firmada a un endpoint `/v1/admin/*` o `/v1/help/*` (asistente). Mismo transporte, firma y
   * traducción de errores que el resto; el timeout puede ser mayor (el planner es lento). No toca la
   * caché de adaptaciones ni los métodos de ai.service.
   */
  postAdmin<T>(
    path: string,
    body: object,
    traceId: string,
    timeoutMs?: number,
  ): Promise<AgentOutcome<T>> {
    return this.post<T>(path, body, traceId, timeoutMs);
  }

  private promptsCache: {
    url: string;
    prompts: PromptIdentity[] | null;
    expiresAt: number;
  } | null = null;

  /**
   * Prompts cargados por el agente (`GET /health`, sin firma, sin costo). Cacheado `promptsTtlMs`
   * por URL. Devuelve null si el agente no responde o no informa `prompts[]`: quien llama decide
   * (la caché de adaptaciones, en ese caso, sirve lo que hay). Nunca lanza.
   */
  async currentPrompts(): Promise<PromptIdentity[] | null> {
    const url = this.config.agentUrl;
    const ttl = this.config.promptsTtlMs;
    if (ttl > 0 && this.promptsCache?.url === url && this.promptsCache.expiresAt > Date.now()) {
      return this.promptsCache.prompts;
    }
    let prompts: PromptIdentity[] | null = null;
    try {
      const res = await fetch(`${url}/health`, {
        signal: AbortSignal.timeout(Math.min(this.config.timeoutMs, 3_000)),
      });
      const payload: unknown = res.ok ? await res.json() : null;
      if (isRecord(payload) && Array.isArray(payload.prompts)) {
        prompts = payload.prompts
          .filter(
            (p): p is { id: string; version: string | number } =>
              isRecord(p) &&
              typeof p.id === 'string' &&
              (typeof p.version === 'string' || typeof p.version === 'number'),
          )
          .map((p) => ({ id: p.id, version: String(p.version) }));
      }
    } catch (error) {
      this.logger.warn(`No se pudo leer /health del agente: ${describe(error)}`);
    }
    // Las fallas se cachean poco para no castigar cada pedido con un agente caído.
    const keepMs = prompts ? ttl : Math.min(ttl, 10_000);
    this.promptsCache = keepMs > 0 ? { url, prompts, expiresAt: Date.now() + keepMs } : null;
    return prompts;
  }

  private async post<T>(
    path: string,
    body: object,
    traceId: string,
    timeoutMs: number = this.config.timeoutMs,
  ): Promise<AgentOutcome<T>> {
    const startedAt = Date.now();
    const transport = (errorCode: TransportErrorCode): TransportFailure => ({
      errorCode,
      latencyMs: Math.max(0, Date.now() - startedAt),
    });
    const rawBody = JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    let response: Response;
    try {
      response = await fetch(`${this.config.agentUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Agent-Timestamp': timestamp,
          'X-Agent-Signature': signBody(this.config.sharedSecret, timestamp, rawBody),
          'X-Trace-Id': traceId,
        },
        body: rawBody,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      this.logger.warn(`Agente inalcanzable (${path}, traceId=${traceId}): ${describe(error)}`);
      return fail(
        'AI_UNAVAILABLE',
        null,
        [],
        transport(isTimeout(error) ? 'AGENT_TIMEOUT' : 'AGENT_UNREACHABLE'),
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      this.logger.warn(
        `Respuesta no JSON del agente (${path}, status=${response.status}, traceId=${traceId})`,
      );
      return fail('AI_UNAVAILABLE', null, [], transport('AGENT_BAD_RESPONSE'));
    }

    if (response.ok) {
      if (!isRecord(payload) || !Array.isArray(payload.usage)) {
        this.logger.error(`Respuesta 2xx fuera de contrato (${path}, traceId=${traceId})`);
        return fail('AI_OUTPUT_INVALID', null, [], transport('AGENT_BAD_RESPONSE'));
      }
      return { ok: true, data: payload as T };
    }

    const envelope = parseEnvelope(payload);
    if (!envelope) {
      this.logger.warn(
        `Error sin envelope (${path}, status=${response.status}, traceId=${traceId})`,
      );
      return fail('AI_UNAVAILABLE', null, [], transport('AGENT_BAD_RESPONSE'));
    }
    const agentCode = envelope.error.code;
    if (agentCode === 'UNAUTHORIZED' || agentCode === 'INVALID_REQUEST') {
      // Misconfiguración o bug de integración: se loguea, no se expone al usuario.
      this.logger.error(
        `Agente respondió ${agentCode} (${path}, traceId=${traceId}); revisar AGENT_SHARED_SECRET / contrato`,
      );
    }
    const failure = fail(
      FAILURE_BY_AGENT_CODE[agentCode] ?? 'AI_UNAVAILABLE',
      agentCode,
      envelope.usage,
    );
    const retryAfter = Number(envelope.error.details?.retryAfterSeconds);
    if (agentCode === 'RATE_LIMITED' && Number.isFinite(retryAfter)) {
      failure.failure.retryAfterSeconds = retryAfter;
    }
    return failure;
  }
}

function fail(
  code: AiFailureCode,
  agentCode: string | null,
  usage: UsageStep[],
  transport?: TransportFailure,
): { ok: false; failure: AgentFailure } {
  return { ok: false, failure: { code, agentCode, usage, ...(transport ? { transport } : {}) } };
}

const isTimeout = (error: unknown): boolean => {
  // Duck typing: DOMException puede venir de otro realm (no es instanceof Error en jest).
  const name =
    typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : null;
  return name === 'TimeoutError' || name === 'AbortError';
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function parseEnvelope(payload: unknown): AgentErrorEnvelope | null {
  if (!isRecord(payload) || !isRecord(payload.error) || typeof payload.error.code !== 'string') {
    return null;
  }
  return {
    traceId: typeof payload.traceId === 'string' ? payload.traceId : null,
    error: {
      code: payload.error.code as AgentErrorEnvelope['error']['code'],
      message: typeof payload.error.message === 'string' ? payload.error.message : '',
      retryable: payload.error.retryable === true,
      details: isRecord(payload.error.details) ? payload.error.details : {},
    },
    usage: Array.isArray(payload.usage) ? (payload.usage as UsageStep[]) : [],
  };
}

const describe = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);
