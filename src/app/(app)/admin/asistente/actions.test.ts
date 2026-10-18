import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCookies } from '../../../../../test/mocks/next-headers';
import {
  clearConversationAction,
  confirmPlanAction,
  discardPlanAction,
  refreshDigestAction,
  sendMessageAction,
} from './actions';

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  unstable_rethrow: (e: unknown) => {
    if (e instanceof Error && e.message.startsWith('NEXT_REDIRECT')) throw e;
  },
}));

const fetchMock = vi.fn();
const requestOf = (i = 0) => fetchMock.mock.calls[i][0] as Request;
const PLAN_ID = '6f1c2f0e-3b8d-4a52-9c5e-1d2a3b4c5d6e';

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  __setCookies({ okr_at: 'tok' });
});

const err = (status: number, code: string, extra: object = {}) =>
  Response.json({ statusCode: status, message: 'x', code, ...extra }, { status });

describe('sendMessageAction', () => {
  it('POST /assistant/messages con el texto recortado', async () => {
    fetchMock.mockResolvedValue(Response.json({ messages: [] }, { status: 201 }));
    const result = await sendMessageAction('  Hola  ');
    expect(result).toEqual({ ok: true, data: { messages: [] } });
    expect(new URL(requestOf().url).pathname).toBe('/assistant/messages');
    expect(requestOf().method).toBe('POST');
    expect(await requestOf().json()).toEqual({ text: 'Hola' });
    expect(requestOf().headers.get('authorization')).toBe('Bearer tok');
  });

  it('rechaza vacío y más de 2000 caracteres sin llamar al back', async () => {
    expect((await sendMessageAction('   ')).ok).toBe(false);
    const long = await sendMessageAction('x'.repeat(2001));
    expect(long.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [503, 'AI_UNAVAILABLE', 'unavailable'],
    [503, 'AI_DISABLED', 'unavailable'],
    [422, 'AI_INPUT_REJECTED', 'rejected'],
  ])('%s %s -> %s', async (status, code, kind) => {
    fetchMock.mockResolvedValue(err(status, code));
    const result = await sendMessageAction('hola');
    expect(!result.ok && result.failure.kind).toBe(kind);
  });

  it('429: demasiados pedidos', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 429 }));
    const result = await sendMessageAction('hola');
    expect(!result.ok && result.failure.kind).toBe('throttled');
  });

  it('back caído: no disponible', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const result = await sendMessageAction('hola');
    expect(!result.ok && result.failure.kind).toBe('unavailable');
  });
});

describe('confirmPlanAction', () => {
  it('envía el planHash que la persona vio y devuelve la clave inicial solo en este resultado', async () => {
    const executed = {
      planId: PLAN_ID,
      status: 'EXECUTED',
      plan: { id: PLAN_ID, status: 'EXECUTED' },
      steps: [
        { index: 0, status: 'OK', description: 'Crear usuario', oneTimeSecret: 'Secreta-123' },
      ],
    };
    fetchMock.mockResolvedValue(Response.json(executed, { status: 201 }));
    const result = await confirmPlanAction(PLAN_ID, 'abc123');
    expect(new URL(requestOf().url).pathname).toBe(`/assistant/plans/${PLAN_ID}/confirm`);
    expect(await requestOf().json()).toEqual({ planHash: 'abc123' });
    expect(result.ok && result.data.steps[0].oneTimeSecret).toBe('Secreta-123');
  });

  it.each([
    [410, 'ASSISTANT_PLAN_EXPIRED', 'expired'],
    [409, 'ASSISTANT_PLAN_HASH_MISMATCH', 'hash-mismatch'],
    [422, 'ASSISTANT_PLAN_INVALID', 'invalid'],
    [404, 'ASSISTANT_PLAN_NOT_FOUND', 'not-found'],
  ])('%s %s -> %s', async (status, code, kind) => {
    fetchMock.mockResolvedValue(err(status, code));
    const result = await confirmPlanAction(PLAN_ID, 'h');
    expect(!result.ok && result.failure.kind).toBe(kind);
    expect(!result.ok && result.plan).toBeUndefined();
  });

  it('409 ya decidido: devuelve el resultado del plan para mostrarlo', async () => {
    const decided = { id: PLAN_ID, status: 'EXECUTED', steps: [{ index: 0, status: 'OK' }] };
    fetchMock.mockResolvedValue(err(409, 'ASSISTANT_PLAN_ALREADY_DECIDED', { result: decided }));
    const result = await confirmPlanAction(PLAN_ID, 'h');
    expect(!result.ok && result.failure.kind).toBe('already-decided');
    expect(!result.ok && result.plan).toEqual(decided);
  });
});

describe('discard, clear y digest', () => {
  it('descartar: POST sin cuerpo y devuelve el plan', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ id: PLAN_ID, status: 'DISCARDED' }, { status: 201 }),
    );
    const result = await discardPlanAction(PLAN_ID);
    expect(new URL(requestOf().url).pathname).toBe(`/assistant/plans/${PLAN_ID}/discard`);
    expect(result.ok && result.data.status).toBe('DISCARDED');
  });

  it('borrar la conversación: DELETE 204 -> ok', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await clearConversationAction()).toEqual({ ok: true, data: true });
    expect(requestOf().method).toBe('DELETE');
    expect(new URL(requestOf().url).pathname).toBe('/assistant/conversation');
  });

  it('borrar falla: error genérico', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    expect((await clearConversationAction()).ok).toBe(false);
  });

  it('actualizar novedades pide refresh=true', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        headline: 'h',
        items: [],
        source: 'TEMPLATE',
        generatedAt: 'x',
        chatAvailable: true,
      }),
    );
    const result = await refreshDigestAction();
    expect(new URL(requestOf().url).search).toBe('?refresh=true');
    expect(result.ok && result.data.source).toBe('TEMPLATE');
  });
});
