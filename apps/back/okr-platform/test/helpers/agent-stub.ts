import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

export type StubMode =
  | 'ok'
  | 'needsReview'
  | 'timeout'
  | 'inputRejected'
  | 'outputInvalid'
  | 'rateLimited'
  | 'modelUnavailable';

/** Respuesta guionada del stub para /v1/admin/* y /v1/help/* (asistente de administración). */
export type AdminResponder = (
  path: string,
  body: any,
  traceId: string,
) => { status?: number; body: unknown } | undefined;

export interface StubCall {
  path: string;
  rawBody: string;
  body: any;
  headers: IncomingMessage['headers'];
  validSignature: boolean;
}

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, '../fixtures/agent', `${name}.json`), 'utf8'));

const respond = (res: import('node:http').ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

/**
 * Agente de mentira (contrato docs/ai/agent-contract.md v1). Verifica la firma HMAC igual que el
 * real, registra cada pedido y responde con los fixtures del contrato según el modo.
 */
export async function startAgentStub(secret: string) {
  let mode: StubMode = 'ok';
  /** Versión de los prompts de adaptación que el stub dice tener cargados (health + respuestas). */
  let adaptPromptVersion = '1';
  let adminResponder: AdminResponder | null = null;
  const isAdaptPrompt = (id: string) => id === 'easy_read' || id === 'plain_language';
  const calls: StubCall[] = [];
  const hanging: import('node:http').ServerResponse[] = [];

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const path = req.url ?? '';
      if (req.method === 'GET' && path === '/health') {
        const health = fixture('health');
        health.prompts = health.prompts.map((p: { id: string; version: string }) =>
          isAdaptPrompt(p.id) ? { ...p, version: adaptPromptVersion } : p,
        );
        return respond(res, 200, health);
      }

      const ts = String(req.headers['x-agent-timestamp'] ?? '');
      const sig = String(req.headers['x-agent-signature'] ?? '');
      const expected = `sha256=${createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex')}`;
      const validSignature =
        sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
      const traceId = String(req.headers['x-trace-id'] ?? '');
      let body: any = null;
      try {
        body = JSON.parse(rawBody);
      } catch {
        // body inválido: queda null
      }
      calls.push({ path, rawBody, body, headers: req.headers, validSignature });

      if (!validSignature) {
        return respond(res, 401, {
          traceId: null,
          error: { code: 'UNAUTHORIZED', message: 'No autorizado', retryable: false, details: {} },
          usage: [],
        });
      }

      const usageOk = fixture('adapt-response').usage;
      const failedUsage = [
        { ...usageOk[1], inputTokens: 0, outputTokens: 0, status: 'FAILED', errorCode: 'TIMEOUT' },
        {
          ...usageOk[1],
          attempt: 2,
          inputTokens: 0,
          outputTokens: 0,
          status: 'FAILED',
          errorCode: 'TIMEOUT',
        },
      ];
      const error = (status: number, code: string, details: object, usage: unknown[]) =>
        respond(res, status, {
          traceId,
          error: { code, message: 'error del stub', retryable: status >= 429, details },
          usage,
        });

      switch (mode) {
        case 'timeout':
          hanging.push(res); // nunca responde: el cliente corta por AGENT_TIMEOUT_MS
          return;
        case 'inputRejected':
          return error(
            422,
            'INPUT_REJECTED',
            { reason: 'INJECTION_SUSPECTED' },
            fixture('error-input-rejected').usage,
          );
        case 'outputInvalid':
          return error(502, 'OUTPUT_INVALID', { step: 'GENERATE' }, usageOk.slice(0, 2));
        case 'rateLimited':
          return error(429, 'RATE_LIMITED', { retryAfterSeconds: 10 }, []);
        case 'modelUnavailable':
          return error(503, 'MODEL_UNAVAILABLE', { step: 'GENERATE' }, failedUsage);
        default:
      }

      if (path.startsWith('/v1/admin/') || path.startsWith('/v1/help/')) {
        const scripted = adminResponder?.(path, body, traceId);
        if (scripted) return respond(res, scripted.status ?? 200, scripted.body);
      }

      if (path === '/v1/adapt') {
        const base = fixture('adapt-response');
        const review = mode === 'needsReview';
        const promptId = body.level === 'PLAIN' ? 'plain_language' : 'easy_read';
        return respond(res, 200, {
          ...base,
          traceId,
          prompt: { ...base.prompt, id: promptId, version: adaptPromptVersion },
          usage: base.usage.map((u: { promptId: string }) =>
            isAdaptPrompt(u.promptId) ? { ...u, promptId, promptVersion: adaptPromptVersion } : u,
          ),
          needsHumanReview: review,
          reviewReason: review ? 'VERIFICATION_FAILED' : null,
          result: {
            level: body.level,
            segments: body.segments.map((s: { key: string; text: string }) => ({
              key: s.key,
              text: review ? s.text : `Versión simple: ${s.text}`,
            })),
            glossary: review ? [] : base.result.glossary,
          },
        });
      }
      if (path === '/v1/okr-suggest') {
        return respond(res, 200, { ...fixture('okr-suggest-response'), traceId });
      }
      if (path === '/v1/checkin-summary') {
        return respond(res, 200, { ...fixture('checkin-summary-response'), traceId });
      }
      respond(res, 404, { error: { code: 'NOT_FOUND' } });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    url,
    calls,
    setMode(next: StubMode) {
      mode = next;
    },
    setAdminResponder(next: AdminResponder | null) {
      adminResponder = next;
    },
    setAdaptPromptVersion(version: string) {
      adaptPromptVersion = version;
    },
    reset() {
      mode = 'ok';
      adaptPromptVersion = '1';
      adminResponder = null;
      calls.length = 0;
    },
    async close() {
      hanging.forEach((r) => r.destroy());
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export type AgentStub = Awaited<ReturnType<typeof startAgentStub>>;
