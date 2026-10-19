import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { bearer } from './helpers/auth';
import { truncateAll } from './helpers/db';
import {
  createCycle,
  createKeyResult,
  createObjective,
  createTeam,
  createUser,
  uuid,
} from './helpers/factories';
import { startAgentStub, type AgentStub } from './helpers/agent-stub';

const SECRET = 'test-agent-secret-solo-para-e2e-0123456789';

describe('IA de accesibilidad cognitiva (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let stub: AgentStub;
  const http = () => request(app.getHttpServer());
  const savedEnv = { ...process.env };

  beforeAll(async () => {
    stub = await startAgentStub(SECRET);
    ({ app, prisma } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
    await stub.close();
    process.env = savedEnv;
  });
  beforeEach(async () => {
    await truncateAll(prisma);
    stub.reset();
    process.env.AI_ENABLED = 'true';
    process.env.AGENT_URL = stub.url;
    process.env.AGENT_SHARED_SECRET = SECRET;
    process.env.AGENT_TIMEOUT_MS = '5000';
    process.env.AI_THROTTLE_LIMIT = '1000';
    process.env.AI_PROMPTS_TTL_MS = '0';
  });

  const as = async (role: 'ADMIN' | 'LEADER' | 'MEMBER') => {
    const user = await createUser(prisma, { role });
    return { user, auth: await bearer(app, user) };
  };

  /** Equipo con líder y dueño; objetivo del equipo PUBLICADO con 2 KRs numéricos. */
  async function world() {
    const admin = await as('ADMIN');
    const lead = await as('LEADER');
    const owner = await as('MEMBER');
    const outsider = await as('MEMBER');
    const team = await createTeam(prisma);
    await prisma.teamMember.createMany({
      data: [
        { userId: lead.user.id, teamId: team.id, isLead: true },
        { userId: owner.user.id, teamId: team.id },
      ],
    });
    const cycle = await createCycle(prisma, { kind: 'QUARTER' });
    const objective = await createObjective(prisma, {
      cycleId: cycle.id,
      createdById: lead.user.id,
      ownerTeamId: team.id,
      title: 'Mejorar el soporte a equipos usuarios',
    });
    await prisma.objective.update({
      where: { id: objective.id },
      data: { status: 'PUBLISHED', description: 'Que respondamos más rápido.' },
    });
    const kr1 = await createKeyResult(prisma, {
      objectiveId: objective.id,
      ownerId: owner.user.id,
      startValue: 8,
      targetValue: 4,
      position: 1,
    });
    await createKeyResult(prisma, {
      objectiveId: objective.id,
      ownerId: owner.user.id,
      startValue: 40,
      targetValue: 75,
      position: 2,
    });
    return { admin, lead, owner, outsider, team, cycle, objective, kr1 };
  }

  const post = (auth: string, path: string, body?: object) =>
    http().post(path).set('Authorization', auth).send(body);
  const get = (auth: string, path: string) => http().get(path).set('Authorization', auth);
  const patch = (auth: string, path: string, body: object) =>
    http().patch(path).set('Authorization', auth).send(body);

  const adaptObjective = (auth: string, id: string, level = 'EASY_READ') =>
    post(auth, `/ai/adapt/objective/${id}?level=${level}`);

  describe('feature flag y estado', () => {
    it('GET /ai/status refleja AI_ENABLED', async () => {
      const w = await world();
      expect((await get(w.owner.auth, '/ai/status').expect(200)).body).toEqual({ enabled: true });
      process.env.AI_ENABLED = 'false';
      expect((await get(w.owner.auth, '/ai/status').expect(200)).body).toEqual({ enabled: false });
    });

    it('AI_ENABLED=false -> 503 AI_DISABLED sin llamar al agente', async () => {
      const w = await world();
      process.env.AI_ENABLED = 'false';
      const res = await adaptObjective(w.owner.auth, w.objective.id).expect(503);
      expect(res.body).toMatchObject({ code: 'AI_DISABLED', statusCode: 503 });
      await post(w.owner.auth, `/ai/check-ins/${w.kr1.id}/summary`).expect(503);
      expect(stub.calls).toHaveLength(0);
    });

    it('requiere autenticación', async () => {
      await http().get('/ai/status').expect(401);
    });
  });

  describe('POST /ai/adapt/objective/:id', () => {
    it('genera, persiste LlmCall + AdaptedContent + AuditLog en una transacción y minimiza', async () => {
      const w = await world();
      const res = await adaptObjective(w.owner.auth, w.objective.id).expect(200);

      expect(res.body).toMatchObject({
        entityType: 'OBJECTIVE',
        entityId: w.objective.id,
        level: 'EASY_READ',
        status: 'DRAFT',
        cached: false,
        requestedById: w.owner.user.id,
      });
      expect(res.body.content.segments.map((s: { key: string }) => s.key)).toEqual([
        'objective.title',
        'objective.description',
        'kr.1.title',
        'kr.1.target',
        'kr.2.title',
        'kr.2.target',
      ]);
      expect(res.body.content.segments[0].text).toContain('Versión simple');
      expect(res.body.generationMs).toBeGreaterThanOrEqual(0);

      // Llamada al agente: firmada, con traceId y SIN datos personales ni ids.
      expect(stub.calls).toHaveLength(1);
      const call = stub.calls[0];
      expect(call.path).toBe('/v1/adapt');
      expect(call.validSignature).toBe(true);
      expect(call.headers['x-trace-id']).toBe(res.body.traceId);
      expect(call.body).toMatchObject({
        level: 'EASY_READ',
        entityType: 'OBJECTIVE',
        locale: 'es',
      });
      expect(call.body.mustPreserve).toEqual(expect.arrayContaining(['8', '4', '40', '75']));
      for (const forbidden of [
        w.owner.user.id,
        w.owner.user.email,
        w.owner.user.name,
        w.objective.id,
        w.team.id,
      ]) {
        expect(call.rawBody).not.toContain(forbidden);
      }
      expect(call.body.segments.find((s: { key: string }) => s.key === 'kr.1.target').text).toBe(
        'de 8 a 4',
      );

      // Persistencia.
      const calls = await prisma.llmCall.findMany({ where: { traceId: res.body.traceId } });
      expect(calls).toHaveLength(3);
      expect(calls.every((c) => c.feature === 'ADAPT' && c.actorId === w.owner.user.id)).toBe(true);
      expect(calls.map((c) => c.step).sort()).toEqual(['CLASSIFY', 'GENERATE', 'JUDGE']);
      expect(Number(calls.find((c) => c.step === 'GENERATE')!.costUsdEst)).toBeGreaterThan(0);

      const audit = await prisma.auditLog.findMany({ where: { action: 'AI_CONTENT_ADAPTED' } });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ actorId: w.owner.user.id, entityType: 'AdaptedContent' });
      const auditJson = JSON.stringify(audit[0]);
      expect(auditJson).not.toContain('Versión simple');
      expect(auditJson).not.toContain(w.objective.title ?? 'x');
      expect(audit[0].after).toMatchObject({
        adaptedContentId: res.body.id,
        traceId: res.body.traceId,
      });
    });

    it('cache hit por sourceHash: no llama al agente ni escribe LlmCall', async () => {
      const w = await world();
      const first = await adaptObjective(w.owner.auth, w.objective.id).expect(200);
      const second = await adaptObjective(w.outsider.auth, w.objective.id).expect(200);
      expect(second.body).toMatchObject({ id: first.body.id, cached: true });
      expect(stub.calls).toHaveLength(1);
      expect(await prisma.llmCall.count()).toBe(3);
      expect(await prisma.adaptedContent.count()).toBe(1);
    });

    it('otro nivel o texto distinto => nueva generación', async () => {
      const w = await world();
      await adaptObjective(w.owner.auth, w.objective.id, 'EASY_READ').expect(200);
      await adaptObjective(w.owner.auth, w.objective.id, 'PLAIN').expect(200);
      expect(stub.calls).toHaveLength(2);
      await prisma.objective.update({
        where: { id: w.objective.id },
        data: { title: 'Un título distinto del objetivo' },
      });
      const res = await adaptObjective(w.owner.auth, w.objective.id, 'PLAIN').expect(200);
      expect(res.body.cached).toBe(false);
      expect(stub.calls).toHaveLength(3);
      expect(await prisma.adaptedContent.count()).toBe(3);
    });

    describe('caché y versión del prompt', () => {
      it('DRAFT de un prompt viejo se regenera EN el lugar (misma fila, nueva versión, auditado)', async () => {
        const w = await world();
        const first = await adaptObjective(w.owner.auth, w.objective.id).expect(200);
        expect(first.body.cached).toBe(false);

        stub.setAdaptPromptVersion('3');
        const second = await adaptObjective(w.owner.auth, w.objective.id).expect(200);
        expect(second.body).toMatchObject({ id: first.body.id, cached: false, status: 'DRAFT' });
        expect(second.body.traceId).not.toBe(first.body.traceId);
        expect(stub.calls.filter((c) => c.path === '/v1/adapt')).toHaveLength(2);
        expect(await prisma.adaptedContent.count()).toBe(1);
        const row = await prisma.adaptedContent.findUniqueOrThrow({ where: { id: first.body.id } });
        expect(row).toMatchObject({ promptId: 'easy_read', promptVersion: '3' });
        const audits = await prisma.auditLog.findMany({
          where: { action: 'AI_CONTENT_ADAPTED', entityId: first.body.id },
        });
        expect(audits).toHaveLength(2);
        expect(JSON.stringify(audits)).toContain('"regenerated":true');

        // Con el prompt vigente, ahora sí es cache hit.
        const third = await adaptObjective(w.owner.auth, w.objective.id).expect(200);
        expect(third.body).toMatchObject({ id: first.body.id, cached: true });
        expect(stub.calls.filter((c) => c.path === '/v1/adapt')).toHaveLength(2);
      });

      it('GET de una DRAFT vencida -> 404 AI_ADAPTATION_NOT_FOUND (el front pide regenerar)', async () => {
        const w = await world();
        await adaptObjective(w.owner.auth, w.objective.id).expect(200);
        stub.setAdaptPromptVersion('3');
        const miss = await get(
          w.owner.auth,
          `/ai/adapt/objective/${w.objective.id}?level=EASY_READ`,
        ).expect(404);
        expect(miss.body.code).toBe('AI_ADAPTATION_NOT_FOUND');
      });

      it('VALIDATED y ACCEPTED se sirven aunque el prompt haya cambiado (sin llamar al agente)', async () => {
        const w = await world();
        const validated = await adaptObjective(w.owner.auth, w.objective.id, 'EASY_READ').expect(
          200,
        );
        await patch(w.lead.auth, `/ai/adapted/${validated.body.id}/validate`, {}).expect(200);
        const accepted = await adaptObjective(w.owner.auth, w.objective.id, 'PLAIN').expect(200);
        await post(w.owner.auth, `/ai/adapted/${accepted.body.id}/accept`).expect(200);

        stub.setAdaptPromptVersion('3');
        stub.calls.length = 0;
        for (const [level, id, status] of [
          ['EASY_READ', validated.body.id, 'VALIDATED'],
          ['PLAIN', accepted.body.id, 'ACCEPTED'],
        ] as const) {
          const res = await adaptObjective(w.owner.auth, w.objective.id, level).expect(200);
          expect(res.body).toMatchObject({ id, status, cached: true });
          await get(w.owner.auth, `/ai/adapt/objective/${w.objective.id}?level=${level}`).expect(
            200,
          );
        }
        expect(stub.calls.filter((c) => c.path === '/v1/adapt')).toHaveLength(0);
        const row = await prisma.adaptedContent.findUniqueOrThrow({
          where: { id: validated.body.id },
        });
        expect(row.promptVersion).toBe('1');
      });

      it('agente sin /health utilizable: se sirve lo cacheado', async () => {
        const w = await world();
        const first = await adaptObjective(w.owner.auth, w.objective.id).expect(200);
        stub.setAdaptPromptVersion('3');
        process.env.AGENT_URL = 'http://127.0.0.1:1'; // inalcanzable
        const res = await adaptObjective(w.owner.auth, w.objective.id).expect(200);
        expect(res.body).toMatchObject({ id: first.body.id, cached: true });
      });
    });

    it('needsHumanReview -> NEEDS_REVIEW con el texto original', async () => {
      const w = await world();
      stub.setMode('needsReview');
      const res = await adaptObjective(w.owner.auth, w.objective.id).expect(200);
      expect(res.body).toMatchObject({
        status: 'NEEDS_REVIEW',
        reviewReason: 'VERIFICATION_FAILED',
      });
      expect(res.body.content.segments[0].text).toBe('Mejorar el soporte a equipos usuarios');
    });

    it('GET devuelve la vigente o 404 AI_ADAPTATION_NOT_FOUND', async () => {
      const w = await world();
      const miss = await get(
        w.owner.auth,
        `/ai/adapt/objective/${w.objective.id}?level=PLAIN`,
      ).expect(404);
      expect(miss.body.code).toBe('AI_ADAPTATION_NOT_FOUND');
      const made = await adaptObjective(w.owner.auth, w.objective.id, 'PLAIN').expect(200);
      const hit = await get(
        w.outsider.auth,
        `/ai/adapt/objective/${w.objective.id}?level=PLAIN`,
      ).expect(200);
      expect(hit.body).toMatchObject({ id: made.body.id, cached: true });
    });

    it('valida parámetros: nivel inválido, tipo desconocido, uuid inválido', async () => {
      const w = await world();
      await post(w.owner.auth, `/ai/adapt/objective/${w.objective.id}?level=XX`).expect(400);
      await post(w.owner.auth, `/ai/adapt/objective/${w.objective.id}`).expect(400);
      await post(w.owner.auth, `/ai/adapt/cycle/${w.objective.id}?level=PLAIN`).expect(404);
      await post(w.owner.auth, '/ai/adapt/objective/no-es-uuid?level=PLAIN').expect(400);
    });

    it('objetivo DRAFT ajeno -> 404 (no revela existencia); el dueño sí puede', async () => {
      const w = await world();
      const draft = await createObjective(prisma, {
        cycleId: w.cycle.id,
        createdById: w.owner.user.id,
        ownerUserId: w.owner.user.id,
      });
      await adaptObjective(w.outsider.auth, draft.id).expect(404);
      await adaptObjective(w.owner.auth, draft.id).expect(200);
      await adaptObjective(w.owner.auth, uuid()).expect(404);
    });
  });

  describe('degradación y errores del agente', () => {
    it('agente caído -> 503 AI_UNAVAILABLE y el resto de la API sigue funcionando', async () => {
      const w = await world();
      process.env.AGENT_URL = 'http://127.0.0.1:9'; // conexión rechazada
      const res = await adaptObjective(w.owner.auth, w.objective.id).expect(503);
      expect(res.body).toMatchObject({ code: 'AI_UNAVAILABLE', statusCode: 503 });
      await get(w.owner.auth, `/objectives/${w.objective.id}`).expect(200);
      await get(w.owner.auth, '/ai/status').expect(200);
      expect(await prisma.adaptedContent.count()).toBe(0);
      const rows = await prisma.llmCall.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        step: 'TRANSPORT',
        model: 'agent',
        status: 'FAILED',
        errorCode: 'AGENT_UNREACHABLE',
        inputTokens: 0,
        outputTokens: 0,
        feature: 'ADAPT',
        actorId: w.owner.user.id,
      });
      expect(Number(rows[0].costUsdEst)).toBe(0);
      // Visible en admin: failures por step, fuera de byModel, sin costo ni usuario activo.
      const usage = await get(w.admin.auth, '/ai/usage').expect(200);
      expect(usage.body.failures).toEqual([
        { step: 'TRANSPORT', errorCode: 'AGENT_UNREACHABLE', count: 1 },
      ]);
      expect(usage.body.byFeature[0]).toMatchObject({ key: 'ADAPT', calls: 1, failedCalls: 1 });
      expect(usage.body.byModel).toEqual([]);
      const impact = await get(w.admin.auth, '/ai/impact').expect(200);
      expect(impact.body.cost).toMatchObject({ totalCostUsdEst: 0, activeUsers: 0 });
    });

    it('timeout del cliente -> 503 AI_UNAVAILABLE', async () => {
      const w = await world();
      process.env.AGENT_TIMEOUT_MS = '250';
      stub.setMode('timeout');
      const started = Date.now();
      const res = await adaptObjective(w.owner.auth, w.objective.id).expect(503);
      expect(res.body.code).toBe('AI_UNAVAILABLE');
      expect(Date.now() - started).toBeLessThan(4000);
      const rows = await prisma.llmCall.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ step: 'TRANSPORT', errorCode: 'AGENT_TIMEOUT' });
      expect(rows[0].latencyMs).toBeGreaterThanOrEqual(200);
    });

    it('firma inválida (secreto distinto) -> el agente responde 401 y Nest expone AI_UNAVAILABLE', async () => {
      const w = await world();
      process.env.AGENT_SHARED_SECRET = 'otro-secreto-que-no-coincide-0123456789';
      const res = await adaptObjective(w.owner.auth, w.objective.id).expect(503);
      expect(res.body.code).toBe('AI_UNAVAILABLE');
      expect(JSON.stringify(res.body)).not.toMatch(/UNAUTHORIZED|secreto/i);
      expect(stub.calls[0].validSignature).toBe(false);
    });

    it('MODEL_UNAVAILABLE con usage -> 503 y LlmCall igual persistidos (FAILED)', async () => {
      const w = await world();
      stub.setMode('modelUnavailable');
      const res = await adaptObjective(w.owner.auth, w.objective.id).expect(503);
      expect(res.body.code).toBe('AI_UNAVAILABLE');
      const rows = await prisma.llmCall.findMany({ orderBy: { attempt: 'asc' } });
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.status === 'FAILED' && r.errorCode === 'TIMEOUT')).toBe(true);
      expect(
        rows.every((r) => r.actorId === w.owner.user.id && r.entityId === w.objective.id),
      ).toBe(true);
      expect(await prisma.adaptedContent.count()).toBe(0);
      expect(await prisma.auditLog.count({ where: { action: 'AI_CONTENT_ADAPTED' } })).toBe(0);
    });

    it('INPUT_REJECTED -> 422 AI_INPUT_REJECTED con LlmCall del clasificador', async () => {
      const w = await world();
      stub.setMode('inputRejected');
      const res = await adaptObjective(w.owner.auth, w.objective.id).expect(422);
      expect(res.body.code).toBe('AI_INPUT_REJECTED');
      expect(await prisma.llmCall.count()).toBe(1);
      expect(await prisma.adaptedContent.count()).toBe(0);
    });

    it('OUTPUT_INVALID -> 502 AI_OUTPUT_INVALID (usage persistido)', async () => {
      const w = await world();
      stub.setMode('outputInvalid');
      const res = await adaptObjective(w.owner.auth, w.objective.id).expect(502);
      expect(res.body.code).toBe('AI_OUTPUT_INVALID');
      expect(await prisma.llmCall.count()).toBe(2);
    });

    it('RATE_LIMITED del agente -> 429 AI_RATE_LIMITED (sin usage, sin filas)', async () => {
      const w = await world();
      stub.setMode('rateLimited');
      const res = await adaptObjective(w.owner.auth, w.objective.id).expect(429);
      expect(res.body.code).toBe('AI_RATE_LIMITED');
      expect(await prisma.llmCall.count()).toBe(0);
    });

    it('límite por usuario (AI_THROTTLE_LIMIT) -> 429 AI_RATE_LIMITED sin llamar al agente', async () => {
      const w = await world();
      process.env.AI_THROTTLE_LIMIT = '2';
      await adaptObjective(w.owner.auth, w.objective.id).expect(200);
      await adaptObjective(w.owner.auth, w.objective.id, 'PLAIN').expect(200);
      const res = await adaptObjective(w.owner.auth, w.objective.id, 'EASY_READ').expect(429);
      expect(res.body.code).toBe('AI_RATE_LIMITED');
      expect(stub.calls).toHaveLength(2);
      // Otro usuario no se ve afectado; los GET tampoco cuentan.
      await adaptObjective(w.outsider.auth, w.objective.id).expect(200);
      await get(w.owner.auth, '/ai/status').expect(200);
    });

    it('respuesta del agente que rompe claves/orden de segmentos -> AI_OUTPUT_INVALID', async () => {
      const w = await world();
      const spy = jest.spyOn(globalThis, 'fetch').mockImplementationOnce(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              traceId: uuid(),
              needsHumanReview: false,
              reviewReason: null,
              result: {
                level: 'EASY_READ',
                segments: [{ key: 'otra.clave', text: 'x' }],
                glossary: [],
              },
              readability: {},
              checks: {},
              prompt: { id: 'easy_read', version: '1', hash: 'h' },
              usage: [],
            }),
            { status: 200 },
          ),
        ),
      );
      const res = await adaptObjective(w.owner.auth, w.objective.id).expect(502);
      expect(res.body.code).toBe('AI_OUTPUT_INVALID');
      spy.mockRestore();
      expect(await prisma.adaptedContent.count()).toBe(0);
    });
  });

  describe('check-ins', () => {
    it('sin nota -> 422 AI_NOTHING_TO_ADAPT; con nota -> adapta y envía el título del KR', async () => {
      const w = await world();
      const empty = await prisma.checkIn.create({
        data: {
          keyResultId: w.kr1.id,
          authorId: w.owner.user.id,
          score: 0.2,
          band: 'RED',
          action: 'START',
        },
      });
      const withNote = await prisma.checkIn.create({
        data: {
          keyResultId: w.kr1.id,
          authorId: w.owner.user.id,
          value: 5.5,
          score: 0.6,
          band: 'YELLOW',
          action: 'CONTINUE',
          note: 'Bajamos a 5,5 h gracias al runbook nuevo.',
        },
      });
      const none = await post(w.owner.auth, `/ai/adapt/check-in/${empty.id}?level=PLAIN`).expect(
        422,
      );
      expect(none.body.code).toBe('AI_NOTHING_TO_ADAPT');
      expect(stub.calls).toHaveLength(0);

      const ok = await post(
        w.outsider.auth,
        `/ai/adapt/check-in/${withNote.id}?level=PLAIN`,
      ).expect(200);
      expect(ok.body).toMatchObject({ entityType: 'CHECK_IN', status: 'DRAFT' });
      expect(stub.calls[0].body.segments.map((s: { key: string }) => s.key)).toEqual([
        'checkin.kr_title',
        'checkin.action',
        'checkin.note',
      ]);
      expect(stub.calls[0].rawBody).not.toContain(w.owner.user.id);
    });

    it('check-in de un objetivo DRAFT ajeno -> 404', async () => {
      const w = await world();
      const draft = await createObjective(prisma, {
        cycleId: w.cycle.id,
        createdById: w.owner.user.id,
        ownerUserId: w.owner.user.id,
      });
      const kr = await createKeyResult(prisma, { objectiveId: draft.id, ownerId: w.owner.user.id });
      const ci = await prisma.checkIn.create({
        data: {
          keyResultId: kr.id,
          authorId: w.owner.user.id,
          score: 0.5,
          band: 'YELLOW',
          action: 'UPDATE',
          note: 'algo',
        },
      });
      await post(w.outsider.auth, `/ai/adapt/check-in/${ci.id}?level=PLAIN`).expect(404);
      await post(w.owner.auth, `/ai/adapt/check-in/${ci.id}?level=PLAIN`).expect(200);
    });
  });

  describe('feedback privado', () => {
    async function feedback(w: Awaited<ReturnType<typeof world>>) {
      return prisma.feedback.create({
        data: {
          fromUserId: w.lead.user.id,
          toUserId: w.owner.user.id,
          content: 'Tu presentación del lunes estuvo muy clara, gracias.',
        },
      });
    }

    it('emisor y receptor pueden adaptar; todos los demás (incluido ADMIN) reciben 404', async () => {
      const w = await world();
      const fb = await feedback(w);
      await post(w.admin.auth, `/ai/adapt/feedback/${fb.id}?level=PLAIN`).expect(404);
      await post(w.outsider.auth, `/ai/adapt/feedback/${fb.id}?level=PLAIN`).expect(404);
      await post(w.admin.auth, `/ai/adapt/feedback/${uuid()}?level=PLAIN`).expect(404);
      expect(stub.calls).toHaveLength(0);

      await post(w.owner.auth, `/ai/adapt/feedback/${fb.id}?level=PLAIN`).expect(200);
      const again = await post(w.lead.auth, `/ai/adapt/feedback/${fb.id}?level=PLAIN`).expect(200);
      expect(again.body.cached).toBe(true);

      // GET con la misma política.
      await get(w.admin.auth, `/ai/adapt/feedback/${fb.id}?level=PLAIN`).expect(404);
      await get(w.owner.auth, `/ai/adapt/feedback/${fb.id}?level=PLAIN`).expect(200);
    });

    it('el contenido del feedback no llega a AuditLog y el feedback no es validable', async () => {
      const w = await world();
      const fb = await feedback(w);
      const made = await post(w.owner.auth, `/ai/adapt/feedback/${fb.id}?level=PLAIN`).expect(200);

      const audit = JSON.stringify(await prisma.auditLog.findMany());
      expect(audit).not.toContain('presentación');
      expect(audit).not.toContain('Versión simple');

      const byAdmin = await patch(w.admin.auth, `/ai/adapted/${made.body.id}/validate`, {}).expect(
        404,
      );
      expect(byAdmin.body.code).toBeUndefined();
      const byReceiver = await patch(
        w.owner.auth,
        `/ai/adapted/${made.body.id}/validate`,
        {},
      ).expect(422);
      expect(byReceiver.body.code).toBe('AI_VALIDATION_NOT_ALLOWED');
      // El receptor sí puede aceptarla.
      const accepted = await post(w.owner.auth, `/ai/adapted/${made.body.id}/accept`).expect(200);
      expect(accepted.body.status).toBe('ACCEPTED');
      await post(w.admin.auth, `/ai/adapted/${made.body.id}/accept`).expect(404);
    });
  });

  describe('aceptar y validar adaptaciones', () => {
    it('accept: solo quien la pidió (otros 403), una sola vez (409)', async () => {
      const w = await world();
      const made = await adaptObjective(w.owner.auth, w.objective.id).expect(200);
      await post(w.outsider.auth, `/ai/adapted/${made.body.id}/accept`).expect(403);
      const ok = await post(w.owner.auth, `/ai/adapted/${made.body.id}/accept`).expect(200);
      expect(ok.body).toMatchObject({ status: 'ACCEPTED' });
      expect(ok.body.acceptedAt).toBeTruthy();
      const again = await post(w.owner.auth, `/ai/adapted/${made.body.id}/accept`).expect(409);
      expect(again.body.code).toBe('AI_ADAPTATION_STATE_CONFLICT');
      await post(w.owner.auth, `/ai/adapted/${uuid()}/accept`).expect(404);
    });

    it('validate: MEMBER 403, líder 200 (VALIDATED + AuditLog sin contenido), repetir 409', async () => {
      const w = await world();
      const made = await adaptObjective(w.owner.auth, w.objective.id).expect(200);
      await patch(w.owner.auth, `/ai/adapted/${made.body.id}/validate`, {}).expect(403);
      await patch(w.outsider.auth, `/ai/adapted/${made.body.id}/validate`, {}).expect(403);

      const ok = await patch(w.lead.auth, `/ai/adapted/${made.body.id}/validate`, {
        note: 'Revisado con el equipo',
      }).expect(200);
      expect(ok.body).toMatchObject({
        status: 'VALIDATED',
        validatedById: w.lead.user.id,
        validationNote: 'Revisado con el equipo',
        humanEdited: false,
      });
      const audit = await prisma.auditLog.findMany({ where: { action: 'AI_CONTENT_VALIDATED' } });
      expect(audit).toHaveLength(1);
      expect(audit[0].before).toEqual({ status: 'DRAFT' });
      expect(JSON.stringify(audit[0])).not.toContain('Versión simple');

      const again = await patch(w.admin.auth, `/ai/adapted/${made.body.id}/validate`, {}).expect(
        409,
      );
      expect(again.body.code).toBe('AI_ADAPTATION_STATE_CONFLICT');
      await post(w.owner.auth, `/ai/adapted/${made.body.id}/accept`).expect(409);
    });

    it('ADMIN valida y NEEDS_REVIEW -> VALIDATED; corrección humana marca humanEdited', async () => {
      const w = await world();
      stub.setMode('needsReview');
      const made = await adaptObjective(w.owner.auth, w.objective.id).expect(200);
      expect(made.body.status).toBe('NEEDS_REVIEW');
      const segments = made.body.content.segments.map((s: { key: string }) => ({
        key: s.key,
        text: `Corregido ${s.key}`,
      }));
      const ok = await patch(w.admin.auth, `/ai/adapted/${made.body.id}/validate`, {
        content: { segments },
      }).expect(200);
      expect(ok.body).toMatchObject({ status: 'VALIDATED', humanEdited: true });
      expect(ok.body.content.segments[0].text).toBe('Corregido objective.title');
      const audit = JSON.stringify(await prisma.auditLog.findMany());
      expect(audit).not.toContain('Corregido');
    });

    it('corrección con claves distintas -> 422 AI_EDITED_CONTENT_INVALID', async () => {
      const w = await world();
      const made = await adaptObjective(w.owner.auth, w.objective.id).expect(200);
      const res = await patch(w.lead.auth, `/ai/adapted/${made.body.id}/validate`, {
        content: { segments: [{ key: 'otra', text: 'x' }] },
      }).expect(422);
      expect(res.body.code).toBe('AI_EDITED_CONTENT_INVALID');
      const still = await prisma.adaptedContent.findUniqueOrThrow({ where: { id: made.body.id } });
      expect(still.status).toBe('DRAFT');
    });

    it('líder de un equipo del usuario dueño valida un objetivo individual', async () => {
      const w = await world();
      const objective = await createObjective(prisma, {
        cycleId: w.cycle.id,
        createdById: w.owner.user.id,
        ownerUserId: w.owner.user.id,
      });
      await prisma.objective.update({ where: { id: objective.id }, data: { status: 'PUBLISHED' } });
      const made = await adaptObjective(w.owner.auth, objective.id).expect(200);
      await patch(w.owner.auth, `/ai/adapted/${made.body.id}/validate`, {}).expect(403);
      await patch(w.lead.auth, `/ai/adapted/${made.body.id}/validate`, {}).expect(200);
    });

    it('rechaza campos desconocidos (whitelist)', async () => {
      const w = await world();
      const made = await adaptObjective(w.owner.auth, w.objective.id).expect(200);
      await patch(w.lead.auth, `/ai/adapted/${made.body.id}/validate`, { status: 'DRAFT' }).expect(
        400,
      );
    });
  });

  describe('sugerir redacción de OKR', () => {
    const draft = {
      title: 'mejorar soporte',
      type: 'COMMITTED',
      keyResults: [
        { title: 'hacer runbooks' },
        { title: 'bajar P1', unit: 'h', startValue: '8', targetValue: '4' },
      ],
    };

    it('persiste AiSuggestion + LlmCall y no toca el objetivo; accept/discard una sola vez', async () => {
      const w = await world();
      const res = await post(w.owner.auth, '/ai/okr-suggest', {
        cycleId: w.cycle.id,
        ownerUserId: w.owner.user.id,
        draft,
      }).expect(200);
      expect(res.body).toMatchObject({ feature: 'OKR_SUGGEST', needsHumanReview: false });
      expect(res.body.payload.objective.title).toBeTruthy();
      expect(stub.calls[0].path).toBe('/v1/okr-suggest');
      expect(stub.calls[0].body).toMatchObject({
        cycleKind: 'QUARTER',
        objective: { title: 'mejorar soporte', description: null, type: 'COMMITTED' },
      });
      expect(stub.calls[0].body.keyResults[1]).toEqual({
        title: 'bajar P1',
        unit: 'h',
        startValue: '8',
        targetValue: '4',
      });
      expect(await prisma.llmCall.count({ where: { feature: 'OKR_SUGGEST' } })).toBe(4);
      expect(await prisma.objective.count()).toBe(1);

      await post(w.outsider.auth, `/ai/suggestions/${res.body.id}/accept`).expect(404);
      const accepted = await post(w.owner.auth, `/ai/suggestions/${res.body.id}/accept`).expect(
        200,
      );
      expect(accepted.body.acceptedAt).toBeTruthy();
      const row = await prisma.aiSuggestion.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.timeToDecisionMs).toBeGreaterThanOrEqual(0);
      expect(await prisma.auditLog.count({ where: { action: 'AI_SUGGESTION_ACCEPTED' } })).toBe(1);
      const again = await post(w.owner.auth, `/ai/suggestions/${res.body.id}/discard`).expect(409);
      expect(again.body.code).toBe('AI_SUGGESTION_ALREADY_DECIDED');
    });

    it('descartar no audita', async () => {
      const w = await world();
      const res = await post(w.owner.auth, '/ai/okr-suggest', {
        cycleId: w.cycle.id,
        ownerUserId: w.owner.user.id,
        draft,
      }).expect(200);
      const out = await post(w.owner.auth, `/ai/suggestions/${res.body.id}/discard`).expect(200);
      expect(out.body.discardedAt).toBeTruthy();
      expect(await prisma.auditLog.count({ where: { action: 'AI_SUGGESTION_ACCEPTED' } })).toBe(0);
    });

    it('permisos: crear para otro usuario o equipo ajeno -> 403; objetivo existente exige poder editarlo', async () => {
      const w = await world();
      await post(w.owner.auth, '/ai/okr-suggest', {
        cycleId: w.cycle.id,
        ownerUserId: w.outsider.user.id,
        draft,
      }).expect(403);
      await post(w.owner.auth, '/ai/okr-suggest', {
        cycleId: w.cycle.id,
        ownerTeamId: w.team.id,
        draft,
      }).expect(403);
      await post(w.lead.auth, '/ai/okr-suggest', {
        cycleId: w.cycle.id,
        ownerTeamId: w.team.id,
        draft,
      }).expect(200);
      await post(w.owner.auth, '/ai/okr-suggest', {
        cycleId: w.cycle.id,
        objectiveId: w.objective.id,
        draft,
      }).expect(403);
      await post(w.lead.auth, '/ai/okr-suggest', {
        cycleId: w.cycle.id,
        objectiveId: w.objective.id,
        draft,
      }).expect(200);
      await post(w.owner.auth, '/ai/okr-suggest', { cycleId: w.cycle.id, draft }).expect(400);
      await post(w.owner.auth, '/ai/okr-suggest', {
        cycleId: uuid(),
        ownerUserId: w.owner.user.id,
        draft,
      }).expect(404);
    });

    it('valida el borrador (>5 KRs, decimal inválido, campos extra)', async () => {
      const w = await world();
      const base = { cycleId: w.cycle.id, ownerUserId: w.owner.user.id };
      await post(w.owner.auth, '/ai/okr-suggest', {
        ...base,
        draft: { ...draft, keyResults: Array.from({ length: 6 }, () => ({ title: 'kr' })) },
      }).expect(400);
      await post(w.owner.auth, '/ai/okr-suggest', {
        ...base,
        draft: { ...draft, keyResults: [{ title: 'kr', startValue: 'abc' }] },
      }).expect(400);
      await post(w.owner.auth, '/ai/okr-suggest', { ...base, draft, extra: 1 }).expect(400);
    });

    it('agente caído -> 503 y no se guarda AiSuggestion', async () => {
      const w = await world();
      process.env.AGENT_URL = 'http://127.0.0.1:9';
      await post(w.owner.auth, '/ai/okr-suggest', {
        cycleId: w.cycle.id,
        ownerUserId: w.owner.user.id,
        draft,
      }).expect(503);
      expect(await prisma.aiSuggestion.count()).toBe(0);
    });
  });

  describe('resumen de check-ins', () => {
    it('KR sin check-ins -> 422; con check-ins envía orden ascendente sin autor', async () => {
      const w = await world();
      const none = await post(w.owner.auth, `/ai/check-ins/${w.kr1.id}/summary`).expect(422);
      expect(none.body.code).toBe('AI_NOTHING_TO_SUMMARIZE');

      for (const [day, note] of [
        [3, 'segundo'],
        [1, 'primero'],
      ] as const) {
        await prisma.checkIn.create({
          data: {
            keyResultId: w.kr1.id,
            authorId: w.owner.user.id,
            value: 6,
            score: 0.5,
            band: 'YELLOW',
            action: 'CONTINUE',
            note,
            createdAt: new Date(Date.UTC(2026, 9, day)),
          },
        });
      }
      const res = await post(
        w.outsider.auth,
        `/ai/check-ins/${w.kr1.id}/summary?level=PLAIN`,
      ).expect(200);
      expect(res.body).toMatchObject({ feature: 'CHECKIN_SUMMARY' });
      expect(res.body.payload.trend).toBe('IMPROVING');
      const sent = stub.calls[0].body;
      expect(sent.level).toBe('PLAIN');
      expect(sent.checkIns.map((c: { note: string }) => c.note)).toEqual(['primero', 'segundo']);
      expect(sent.keyResult).toMatchObject({
        scoring: 'DERIVED',
        startValue: '8',
        targetValue: '4',
      });
      expect(stub.calls[0].rawBody).not.toContain(w.owner.user.id);
      expect(
        await prisma.aiSuggestion.count({
          where: { feature: 'CHECKIN_SUMMARY', entityId: w.kr1.id },
        }),
      ).toBe(1);
    });

    it('KR inexistente u objetivo DRAFT ajeno -> 404; nivel inválido -> 400', async () => {
      const w = await world();
      await post(w.owner.auth, `/ai/check-ins/${uuid()}/summary`).expect(404);
      await post(w.owner.auth, `/ai/check-ins/${w.kr1.id}/summary?level=EASY_READ`).expect(400);
      const draftObj = await createObjective(prisma, {
        cycleId: w.cycle.id,
        createdById: w.owner.user.id,
        ownerUserId: w.owner.user.id,
      });
      const kr = await createKeyResult(prisma, {
        objectiveId: draftObj.id,
        ownerId: w.owner.user.id,
      });
      await post(w.outsider.auth, `/ai/check-ins/${kr.id}/summary`).expect(404);
    });
  });

  describe('GET /ai/usage y /ai/impact (solo ADMIN)', () => {
    it('no-ADMIN -> 403 (incluido LEADER)', async () => {
      const w = await world();
      for (const who of [w.owner, w.lead]) {
        await get(who.auth, '/ai/usage').expect(403);
        await get(who.auth, '/ai/impact').expect(403);
      }
      await http().get('/ai/usage').expect(401);
    });

    it('sin datos: estructuras vacías y tasas null', async () => {
      const w = await world();
      const usage = await get(w.admin.auth, '/ai/usage').expect(200);
      expect(usage.body).toMatchObject({ byFeature: [], byModel: [], failures: [] });
      const impact = await get(w.admin.auth, '/ai/impact').expect(200);
      expect(impact.body.adoption).toMatchObject({
        adaptationsTotal: 0,
        adaptationAcceptanceRate: null,
        suggestionsTotal: 0,
      });
      expect(impact.body.cost).toMatchObject({ activeUsers: 0, costPerActiveUserUsdEst: null });
    });

    it('agrega uso por feature/modelo y el impacto sin datos por persona', async () => {
      const w = await world();
      const made = await adaptObjective(w.owner.auth, w.objective.id).expect(200);
      await post(w.owner.auth, `/ai/adapted/${made.body.id}/accept`).expect(200);
      await adaptObjective(w.outsider.auth, w.objective.id, 'PLAIN').expect(200);
      stub.setMode('modelUnavailable');
      await adaptObjective(w.owner.auth, w.objective.id, 'EASY_READ').expect(200); // cache
      stub.setMode('ok');
      await post(w.owner.auth, '/ai/okr-suggest', {
        cycleId: w.cycle.id,
        ownerUserId: w.owner.user.id,
        draft: { title: 'mejorar soporte', type: 'COMMITTED' },
      }).expect(200);

      const usage = await get(w.admin.auth, '/ai/usage').expect(200);
      const adapt = usage.body.byFeature.find((r: { key: string }) => r.key === 'ADAPT');
      expect(adapt).toMatchObject({ calls: 6, failedCalls: 0, fallbackRate: 0 });
      expect(adapt.costUsdEst).toBeGreaterThan(0);
      expect(adapt.latencyP50Ms).toBeGreaterThan(0);
      expect(adapt.latencyP95Ms).toBeGreaterThanOrEqual(adapt.latencyP50Ms);
      expect(usage.body.byFeature.find((r: { key: string }) => r.key === 'OKR_SUGGEST').calls).toBe(
        4,
      );
      expect(usage.body.byModel.length).toBeGreaterThanOrEqual(3);

      const impact = await get(w.admin.auth, '/ai/impact').expect(200);
      expect(impact.body.adoption).toMatchObject({
        adaptationsTotal: 2,
        adaptationsAccepted: 1,
        adaptationAcceptanceRate: 0.5,
        suggestionsTotal: 1,
        suggestionsAccepted: 0,
        suggestionAcceptanceRate: 0,
      });
      expect(impact.body.quality.meanReadabilityDelta).toBeCloseTo(31.8, 1);
      expect(impact.body.quality.needsReviewRate).toBe(0);
      expect(impact.body.cost.activeUsers).toBe(2);
      expect(impact.body.cost.totalCostUsdEst).toBeGreaterThan(0);
      expect(impact.body.cost.costPerActiveUserUsdEst).toBeGreaterThan(0);
      expect(JSON.stringify(impact.body)).not.toContain(w.owner.user.id);
    });

    it('registra fallos por paso en /ai/usage y respeta el rango', async () => {
      const w = await world();
      stub.setMode('modelUnavailable');
      await adaptObjective(w.owner.auth, w.objective.id).expect(503);
      const usage = await get(w.admin.auth, '/ai/usage').expect(200);
      expect(usage.body.failures).toEqual([{ step: 'GENERATE', errorCode: 'TIMEOUT', count: 2 }]);
      const past = await get(
        w.admin.auth,
        '/ai/usage?from=2020-01-01T00:00:00Z&to=2020-02-01T00:00:00Z',
      ).expect(200);
      expect(past.body.byFeature).toEqual([]);
      await get(w.admin.auth, '/ai/usage?from=no-es-fecha').expect(400);
    });
  });
});
