#!/usr/bin/env node
/**
 * Agente de IA de mentira para los e2e del front (contrato `docs/ai/agent-contract.md` v1).
 *
 * Por qué un stub y no el agente real: el agente (FastAPI + ADK) necesita una API key de NVIDIA NIM y
 * respondería distinto en cada corrida. Los e2e del front prueban el recorrido de la UI contra el back
 * REAL (NestJS + Postgres), que habla HTTP + HMAC con ESTE proceso. Así se ejercita todo menos el LLM.
 *
 * Es el mismo enfoque del e2e del back (`test/helpers/agent-stub.ts`): verifica la firma HMAC igual que
 * el agente real y responde con los fixtures del contrato (se leen del back: una sola fuente de verdad).
 *
 * Control de pruebas (solo 127.0.0.1, nunca en producción):
 *   POST /__mode  {"mode":"ok"|"needsReview"|"down"|"inputRejected"|"outputInvalid"|"rateLimited"|"modelUnavailable"}
 *   GET  /__calls -> pedidos recibidos (path, firma válida, body)
 *   POST /__delay {"ms":number} -> demora las respuestas de /v1/admin/* y /v1/help/* (estado "pensando" del asistente)
 *   POST /__reset -> modo ok, sin demora y sin pedidos registrados
 *
 * Asistente de administración (/v1/admin/chat, /v1/admin/digest-summary): ver agent-stub-admin.mjs.
 *
 * Uso: node e2e/helpers/agent-stub.mjs [--port 8089] [--secret ...] [--fixtures <dir>]
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adminResponse } from './agent-stub-admin.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export const STUB_DEFAULTS = {
  port: 8089,
  secret: 'e2e-front-agent-secret-0123456789abcdef',
  fixturesDir: resolve(
    ROOT,
    process.env.E2E_BACK_DIR ?? '../okr-platform-back',
    'okr-platform/test/fixtures/agent',
  ),
};

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

export function createAgentStub({ secret, fixturesDir }) {
  let mode = 'ok';
  let delayMs = 0;
  const calls = [];
  const fixture = (name) => JSON.parse(readFileSync(resolve(fixturesDir, `${name}.json`), 'utf8'));

  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const path = req.url ?? '';

      if (req.method === 'GET' && path === '/health') return send(res, 200, fixture('health'));
      if (path.startsWith('/__')) {
        if (path === '/__calls') return send(res, 200, calls);
        if (path === '/__reset') {
          mode = 'ok';
          delayMs = 0;
          calls.length = 0;
          return send(res, 200, { mode });
        }
        if (path === '/__delay') {
          delayMs = Number(JSON.parse(rawBody).ms) || 0;
          return send(res, 200, { delayMs });
        }
        if (path === '/__mode') {
          mode = JSON.parse(rawBody).mode;
          return send(res, 200, { mode });
        }
        return send(res, 404, {});
      }

      const ts = String(req.headers['x-agent-timestamp'] ?? '');
      const sig = String(req.headers['x-agent-signature'] ?? '');
      const expected = `sha256=${createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex')}`;
      const validSignature =
        sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
      const traceId = String(req.headers['x-trace-id'] ?? '');
      let body = null;
      try {
        body = JSON.parse(rawBody);
      } catch {
        // body inválido: queda null
      }
      calls.push({ path, validSignature, body });

      if (!validSignature) {
        return send(res, 401, {
          traceId: null,
          error: { code: 'UNAUTHORIZED', message: 'No autorizado', retryable: false, details: {} },
          usage: [],
        });
      }
      // Asistente de administración: independiente de los modos globales (`/__mode`), que son de los specs de
      // adaptación y corren en paralelo. Sus fallas se disparan por texto (ver agent-stub-admin.mjs).
      if (path.startsWith('/v1/admin/') || path.startsWith('/v1/help/')) {
        const out = adminResponse(path, body, traceId);
        if (out === undefined) return send(res, 404, { error: { code: 'NOT_FOUND' } });
        if (out.drop) return req.socket.destroy();
        const wait = (out.delayMs ?? 0) + delayMs;
        if (wait > 0) return setTimeout(() => send(res, out.status ?? 200, out.body), wait);
        return send(res, out.status ?? 200, out.body);
      }

      // Agente caído: corta la conexión sin responder (el back lo traduce a AI_UNAVAILABLE 503).
      if (mode === 'down') return req.socket.destroy();

      const usage = fixture('adapt-response').usage;
      const error = (status, code, details, used) =>
        send(res, status, {
          traceId,
          error: { code, message: 'error del stub', retryable: status >= 429, details },
          usage: used,
        });
      if (mode === 'inputRejected') {
        return error(422, 'INPUT_REJECTED', { reason: 'INJECTION_SUSPECTED' }, usage.slice(0, 1));
      }
      if (mode === 'outputInvalid')
        return error(502, 'OUTPUT_INVALID', { step: 'GENERATE' }, usage);
      if (mode === 'rateLimited') return error(429, 'RATE_LIMITED', { retryAfterSeconds: 10 }, []);
      if (mode === 'modelUnavailable')
        return error(503, 'MODEL_UNAVAILABLE', { step: 'GENERATE' }, []);

      if (path === '/v1/adapt') {
        const base = fixture('adapt-response');
        const review = mode === 'needsReview';
        return send(res, 200, {
          ...base,
          traceId,
          needsHumanReview: review,
          reviewReason: review ? 'VERIFICATION_FAILED' : null,
          result: {
            level: body.level,
            segments: body.segments.map((s) => ({
              key: s.key,
              text: review ? s.text : `Versión simple: ${s.text}`,
            })),
            glossary: review ? [] : base.result.glossary,
          },
        });
      }
      if (path === '/v1/okr-suggest') {
        return send(res, 200, { ...fixture('okr-suggest-response'), traceId });
      }
      if (path === '/v1/checkin-summary') {
        return send(res, 200, { ...fixture('checkin-summary-response'), traceId });
      }
      send(res, 404, { error: { code: 'NOT_FOUND' } });
    });
  });
  return server;
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(arg('port', STUB_DEFAULTS.port));
  const server = createAgentStub({
    secret: arg('secret', STUB_DEFAULTS.secret),
    fixturesDir: arg('fixtures', STUB_DEFAULTS.fixturesDir),
  });
  server.listen(port, '127.0.0.1', () => console.log(`Agente stub escuchando en :${port}`));
}
