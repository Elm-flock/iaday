import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AiClient, signBody } from './ai.client';
import { AiConfig } from './ai.config';

const fixture = <T>(name: string): T =>
  JSON.parse(
    readFileSync(join(__dirname, '../../test/fixtures/agent', `${name}.json`), 'utf8'),
  ) as T;

const SECRET = 'test-secret-0123456789abcdef0123456789';
const TRACE = '3b1f6c2e-8f4d-4a51-9a63-2d7f0c9e5b10';

const config = (over: Record<string, string> = {}) =>
  new AiConfig({
    get: (k: string) =>
      ({
        AGENT_URL: 'http://agent.test:8088/',
        AGENT_SHARED_SECRET: SECRET,
        AGENT_TIMEOUT_MS: '1000',
        ...over,
      })[k],
  } as unknown as ConfigService);

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('signBody', () => {
  it('coincide con el vector fijo HMAC-SHA256("{ts}.{body}")', () => {
    expect(signBody(SECRET, '1792339200', '{"a":1}')).toBe(
      'sha256=e5d008021484ca4d7dc36ae865121a0de65e8df1114c1a4b2c4ed48eff5e160c',
    );
  });
  it('cambia si cambia el timestamp o el body', () => {
    const base = signBody(SECRET, '1', 'x');
    expect(signBody(SECRET, '2', 'x')).not.toBe(base);
    expect(signBody(SECRET, '1', 'y')).not.toBe(base);
  });
});

describe('AiClient', () => {
  let fetchSpy: jest.SpyInstance;
  const client = new AiClient(config());
  const request = fixture<Parameters<AiClient['adapt']>[0]>('adapt-request');

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());

  it('firma los bytes exactos del body y manda los tres headers', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, fixture('adapt-response')));
    const outcome = await client.adapt(request, TRACE);

    expect(outcome.ok).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://agent.test:8088/v1/adapt');
    const headers = init.headers as Record<string, string>;
    expect(init.body).toBe(JSON.stringify(request));
    expect(headers['X-Trace-Id']).toBe(TRACE);
    expect(headers['X-Agent-Signature']).toBe(
      signBody(SECRET, headers['X-Agent-Timestamp'], init.body as string),
    );
    expect(Number(headers['X-Agent-Timestamp'])).toBeCloseTo(Date.now() / 1000, -1);
  });

  it('usa el path de cada feature', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(jsonResponse(200, fixture('okr-suggest-response'))),
    );
    await client.okrSuggest(fixture('okr-suggest-request'), TRACE);
    await client.checkinSummary(fixture('checkin-summary-request'), TRACE);
    expect(fetchSpy.mock.calls.map((c) => c[0])).toEqual([
      'http://agent.test:8088/v1/okr-suggest',
      'http://agent.test:8088/v1/checkin-summary',
    ]);
  });

  it('conexión rechazada -> AI_UNAVAILABLE sin usage', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'));
    expect(await client.adapt(request, TRACE)).toEqual({
      ok: false,
      failure: {
        code: 'AI_UNAVAILABLE',
        agentCode: null,
        usage: [],
        transport: { errorCode: 'AGENT_UNREACHABLE', latencyMs: expect.any(Number) },
      },
    });
  });

  it('timeout del cliente -> AI_UNAVAILABLE', async () => {
    fetchSpy.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    const outcome = await client.adapt(request, TRACE);
    expect(outcome).toMatchObject({
      ok: false,
      failure: { code: 'AI_UNAVAILABLE', transport: { errorCode: 'AGENT_TIMEOUT' } },
    });
  });

  it('envía una señal de abort con el timeout configurado', async () => {
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    fetchSpy.mockResolvedValue(jsonResponse(200, fixture('adapt-response')));
    await client.adapt(request, TRACE);
    expect(timeoutSpy).toHaveBeenCalledWith(1000);
  });

  const usage = fixture<{ usage: unknown[] }>('error-input-rejected').usage;
  it.each([
    [422, 'INPUT_REJECTED', 'AI_INPUT_REJECTED'],
    [429, 'RATE_LIMITED', 'AI_RATE_LIMITED'],
    [502, 'OUTPUT_INVALID', 'AI_OUTPUT_INVALID'],
    [503, 'MODEL_UNAVAILABLE', 'AI_UNAVAILABLE'],
    [500, 'INTERNAL', 'AI_UNAVAILABLE'],
    [401, 'UNAUTHORIZED', 'AI_UNAVAILABLE'],
    [400, 'INVALID_REQUEST', 'AI_UNAVAILABLE'],
  ])('envelope %i %s -> %s conservando usage[]', async (status, agentCode, code) => {
    fetchSpy.mockResolvedValue(
      jsonResponse(status, {
        traceId: TRACE,
        error: {
          code: agentCode,
          message: 'm',
          retryable: false,
          details: { retryAfterSeconds: 10 },
        },
        usage,
      }),
    );
    const outcome = await client.adapt(request, TRACE);
    expect(outcome).toMatchObject({ ok: false, failure: { code, agentCode } });
    if (!outcome.ok) {
      expect(outcome.failure.transport).toBeUndefined();
      expect(outcome.failure.usage).toEqual(usage);
      expect(outcome.failure.retryAfterSeconds).toBe(agentCode === 'RATE_LIMITED' ? 10 : undefined);
    }
  });

  it('error sin usage en el envelope -> usage []', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(503, { traceId: null, error: { code: 'MODEL_UNAVAILABLE' } }),
    );
    const outcome = await client.adapt(request, TRACE);
    expect(outcome).toMatchObject({ ok: false, failure: { usage: [] } });
  });

  it('respuesta no JSON (p. ej. HTML de un proxy) -> AI_UNAVAILABLE', async () => {
    fetchSpy.mockResolvedValue(new Response('<html>502</html>', { status: 502 }));
    expect(await client.adapt(request, TRACE)).toMatchObject({
      ok: false,
      failure: { code: 'AI_UNAVAILABLE', transport: { errorCode: 'AGENT_BAD_RESPONSE' } },
    });
  });

  it('error JSON sin envelope -> AI_UNAVAILABLE', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(500, { detail: 'boom' }));
    expect(await client.adapt(request, TRACE)).toMatchObject({
      ok: false,
      failure: { code: 'AI_UNAVAILABLE' },
    });
  });

  it('2xx fuera de contrato (sin usage) -> AI_OUTPUT_INVALID', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, { hola: 'mundo' }));
    expect(await client.adapt(request, TRACE)).toMatchObject({
      ok: false,
      failure: { code: 'AI_OUTPUT_INVALID' },
    });
  });
});
