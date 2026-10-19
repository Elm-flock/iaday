import type { UsageStep } from '../agent-contract.types';
import { toLlmCallRows, toTransportFailureRow } from './usage-mapper';

const ctx = {
  traceId: 't',
  feature: 'ADAPT' as const,
  actorId: 'u',
  entityType: 'CHECK_IN' as const,
  entityId: 'e',
};
const step = (over: Partial<UsageStep> = {}): UsageStep => ({
  step: 'GENERATE',
  attempt: 1,
  model: 'm',
  isFallback: false,
  promptId: 'easy_read',
  promptVersion: '1',
  promptHash: 'abc',
  inputTokens: 10,
  outputTokens: 5,
  latencyMs: 100,
  costUsdEst: 0.000123456789,
  status: 'OK',
  errorCode: null,
  ...over,
});

describe('toLlmCallRows', () => {
  it('una fila por intento con el contexto', () => {
    const rows = toLlmCallRows(
      [step(), step({ attempt: 2, status: 'FAILED', errorCode: 'TIMEOUT' })],
      ctx,
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      traceId: 't',
      actorId: 'u',
      status: 'FAILED',
      errorCode: 'TIMEOUT',
      attempt: 2,
    });
    expect(rows[0].costUsdEst).toBe(0.00012346);
  });
  it('vacío -> vacío', () => {
    expect(toLlmCallRows([], ctx)).toEqual([]);
  });
  it('sanea valores inválidos', () => {
    const [row] = toLlmCallRows(
      [
        step({
          attempt: 0,
          inputTokens: -5,
          outputTokens: Number.NaN,
          latencyMs: 12.6,
          costUsdEst: -1,
          isFallback: undefined as never,
          status: 'weird' as never,
          errorCode: undefined as never,
        }),
      ],
      ctx,
    );
    expect(row).toMatchObject({
      attempt: 1,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 13,
      costUsdEst: 0,
      isFallback: false,
      status: 'FAILED',
      errorCode: null,
    });
  });
  it('promptVersion se guarda como string', () => {
    expect(toLlmCallRows([step({ promptVersion: 2 as never })], ctx)[0].promptVersion).toBe('2');
  });
});

describe('toTransportFailureRow', () => {
  it('fila FAILED step TRANSPORT, modelo agent, sin tokens ni costo', () => {
    expect(toTransportFailureRow({ errorCode: 'AGENT_TIMEOUT', latencyMs: 40012.6 }, ctx)).toEqual({
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
      latencyMs: 40013,
      costUsdEst: 0,
      status: 'FAILED',
      errorCode: 'AGENT_TIMEOUT',
    });
  });
  it('latencia invalida -> 0', () => {
    expect(
      toTransportFailureRow({ errorCode: 'AGENT_UNREACHABLE', latencyMs: NaN }, ctx).latencyMs,
    ).toBe(0);
  });
});
