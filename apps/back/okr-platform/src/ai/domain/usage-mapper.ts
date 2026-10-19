import type { UsageStep } from '../agent-contract.types';

export interface LlmCallRow {
  traceId: string;
  feature:
    'ADAPT' | 'OKR_SUGGEST' | 'CHECKIN_SUMMARY' | 'ADMIN_CHAT' | 'ADMIN_DIGEST' | 'HELP_ANSWER';
  step: UsageStep['step'] | 'TRANSPORT';
  attempt: number;
  model: string;
  isFallback: boolean;
  promptId: string;
  promptVersion: string;
  promptHash: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsdEst: number;
  status: 'OK' | 'FAILED';
  errorCode: string | null;
  actorId: string | null;
  entityType: 'OBJECTIVE' | 'KEY_RESULT' | 'CHECK_IN' | 'FEEDBACK' | 'ASSISTANT_PLAN' | null;
  entityId: string | null;
}

export interface UsageContext {
  traceId: string;
  feature: LlmCallRow['feature'];
  actorId: string | null;
  entityType: LlmCallRow['entityType'];
  entityId: string | null;
}

const nonNegInt = (n: unknown): number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : 0;

/** `usage[]` del agente -> filas LlmCall (una por intento; tolera campos faltantes sin romper). */
export function toLlmCallRows(usage: UsageStep[], ctx: UsageContext): LlmCallRow[] {
  return usage.map((u) => ({
    ...ctx,
    step: u.step,
    attempt: Math.max(1, nonNegInt(u.attempt)),
    model: u.model,
    isFallback: u.isFallback === true,
    promptId: u.promptId,
    promptVersion: String(u.promptVersion),
    promptHash: u.promptHash,
    inputTokens: nonNegInt(u.inputTokens),
    outputTokens: nonNegInt(u.outputTokens),
    latencyMs: nonNegInt(u.latencyMs),
    costUsdEst:
      typeof u.costUsdEst === 'number' && Number.isFinite(u.costUsdEst) && u.costUsdEst > 0
        ? Number(u.costUsdEst.toFixed(8))
        : 0,
    status: u.status === 'OK' ? 'OK' : 'FAILED',
    errorCode: u.errorCode ?? null,
  }));
}

/**
 * Falla de transporte (agente inalcanzable, timeout, respuesta ilegible): no hubo llamada al modelo,
 * pero la indisponibilidad debe verse en admin. Costo y tokens 0 (no es costo de modelo).
 */
export function toTransportFailureRow(
  failure: { errorCode: string; latencyMs: number },
  ctx: UsageContext,
): LlmCallRow {
  return {
    ...ctx,
    step: 'TRANSPORT',
    attempt: 1,
    model: 'agent',
    isFallback: false,
    promptId: 'transport',
    promptVersion: '0',
    promptHash: '-',
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: nonNegInt(failure.latencyMs),
    costUsdEst: 0,
    status: 'FAILED',
    errorCode: failure.errorCode,
  };
}
