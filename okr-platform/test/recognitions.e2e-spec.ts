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
} from './helpers/factories';

describe('Reconocimientos (e2e) REQ-REC-1', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await truncateAll(prisma);
  });

  const as = async (role: 'ADMIN' | 'LEADER' | 'MEMBER' = 'MEMBER') => {
    const user = await createUser(prisma, { role });
    return { user, auth: await bearer(app, user) };
  };
  const give = (auth: string, payload: object) =>
    http().post('/recognitions').set('Authorization', auth).send(payload);

  /** Objetivo PUBLISHED de `ownerId` con un KR de score `krScore`. */
  const objectiveWithKr = async (
    ownerId: string,
    krScore: number,
    status: 'PUBLISHED' | 'CLOSED' = 'PUBLISHED',
  ) => {
    const cycle = await createCycle(prisma);
    const objective = await createObjective(prisma, {
      cycleId: cycle.id,
      createdById: ownerId,
      ownerUserId: ownerId,
    });
    await prisma.objective.update({
      where: { id: objective.id },
      data: {
        status,
        publishedAt: new Date(),
        ...(status === 'CLOSED' ? { closedAt: new Date() } : {}),
      },
    });
    const kr = await createKeyResult(prisma, { objectiveId: objective.id, ownerId });
    await prisma.keyResult.update({ where: { id: kr.id }, data: { score: krScore } });
    return { objective, kr };
  };

  describe('POST /recognitions', () => {
    it('sin enlace -> 201 con milestoneVerified=false', async () => {
      const a = await as();
      const b = await as();
      const res = await give(a.auth, {
        toUserId: b.user.id,
        message: 'Gracias por tu ayuda',
      }).expect(201);
      expect(res.body).toMatchObject({
        fromUserId: a.user.id,
        toUserId: b.user.id,
        message: 'Gracias por tu ayuda',
        objectiveId: null,
        keyResultId: null,
        milestoneVerified: false,
      });
    });

    it('KR con score 0.7 (borde inclusivo) -> 201 con hito verificado', async () => {
      const a = await as();
      const b = await as();
      const { kr, objective } = await objectiveWithKr(b.user.id, 0.7);
      const res = await give(a.auth, {
        toUserId: b.user.id,
        message: 'Llegaste',
        keyResultId: kr.id,
      }).expect(201);
      expect(res.body).toMatchObject({
        keyResultId: kr.id,
        objectiveId: objective.id,
        milestoneVerified: true,
      });
    });

    it('KR con score 0.69 -> 422 (hito no alcanzado) y no se crea nada', async () => {
      const a = await as();
      const b = await as();
      const { kr } = await objectiveWithKr(b.user.id, 0.69);
      const res = await give(a.auth, {
        toUserId: b.user.id,
        message: 'Casi',
        keyResultId: kr.id,
      }).expect(422);
      expect(res.body.code).toBe('MILESTONE_NOT_REACHED');
      expect(await prisma.recognition.count()).toBe(0);
    });

    it('objetivo CLOSED -> 201; objetivo PUBLISHED sin cerrar -> 422', async () => {
      const a = await as();
      const b = await as();
      const closed = await objectiveWithKr(b.user.id, 0.2, 'CLOSED');
      const open = await objectiveWithKr(b.user.id, 0.2);
      await give(a.auth, {
        toUserId: b.user.id,
        message: 'Cerró el ciclo',
        objectiveId: closed.objective.id,
      }).expect(201);
      await give(a.auth, {
        toUserId: b.user.id,
        message: 'Todavía no',
        objectiveId: open.objective.id,
      }).expect(422);
    });

    it('autoreconocimiento -> 400 con código RECOGNITION_SELF', async () => {
      const a = await as();
      const res = await give(a.auth, { toUserId: a.user.id, message: 'Soy genial' }).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, code: 'RECOGNITION_SELF' });
      expect(typeof res.body.message).toBe('string');
    });

    it('KR que el destinatario es dueño dentro de un objetivo de EQUIPO (score >= 0.7) -> 201', async () => {
      const a = await as();
      const b = await as();
      const team = await createTeam(prisma);
      const cycle = await createCycle(prisma);
      const objective = await createObjective(prisma, {
        cycleId: cycle.id,
        createdById: a.user.id,
        ownerTeamId: team.id,
      });
      await prisma.objective.update({
        where: { id: objective.id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
      const kr = await createKeyResult(prisma, { objectiveId: objective.id, ownerId: b.user.id });
      await prisma.keyResult.update({ where: { id: kr.id }, data: { score: 0.8 } });
      const res = await give(a.auth, {
        toUserId: b.user.id,
        message: 'Gran aporte al equipo',
        keyResultId: kr.id,
      }).expect(201);
      expect(res.body).toMatchObject({
        keyResultId: kr.id,
        objectiveId: objective.id,
        milestoneVerified: true,
      });
    });

    it('destinatario o KR inexistente -> 404; KR de otro objetivo -> 400', async () => {
      const a = await as();
      const b = await as();
      const missing = '6f1c2f0e-3b8d-4a52-9c5e-1d2a3b4c5d6e';
      await give(a.auth, { toUserId: missing, message: 'Hola' }).expect(404);
      await give(a.auth, { toUserId: b.user.id, message: 'Hola', keyResultId: missing }).expect(
        404,
      );
      const one = await objectiveWithKr(b.user.id, 1);
      const other = await objectiveWithKr(b.user.id, 1);
      await give(a.auth, {
        toUserId: b.user.id,
        message: 'Hola',
        keyResultId: one.kr.id,
        objectiveId: other.objective.id,
      }).expect(400);
    });

    it('un objetivo DRAFT ajeno no se puede enlazar (404, no revela su existencia)', async () => {
      const a = await as();
      const b = await as();
      const cycle = await createCycle(prisma);
      const draft = await createObjective(prisma, {
        cycleId: cycle.id,
        createdById: b.user.id,
        ownerUserId: b.user.id,
      });
      await give(a.auth, {
        toUserId: b.user.id,
        message: 'Hola',
        objectiveId: draft.id,
      }).expect(404);
    });

    it('mensaje vacío, fromUserId o milestoneVerified en el body -> 400 (whitelist)', async () => {
      const a = await as();
      const b = await as();
      await give(a.auth, { toUserId: b.user.id, message: '' }).expect(400);
      await give(a.auth, { toUserId: b.user.id, message: 'x', fromUserId: b.user.id }).expect(400);
      await give(a.auth, { toUserId: b.user.id, message: 'x', milestoneVerified: true }).expect(
        400,
      );
    });

    it('sin token -> 401', async () => {
      await http().post('/recognitions').send({}).expect(401);
    });
  });

  describe('GET /recognitions (muro público)', () => {
    it('cualquier autenticado ve TODOS los reconocimientos, del más nuevo al más viejo, paginados', async () => {
      const a = await as();
      const b = await as();
      const c = await as('ADMIN');
      await give(a.auth, { toUserId: b.user.id, message: 'uno' }).expect(201);
      await give(b.auth, { toUserId: a.user.id, message: 'dos' }).expect(201);

      const res = await http().get('/recognitions').set('Authorization', c.auth).expect(200);
      expect(res.body).toMatchObject({ total: 2, page: 1, limit: 20 });
      expect(res.body.items.map((r: { message: string }) => r.message)).toEqual(['dos', 'uno']);

      const paged = await http()
        .get('/recognitions?limit=1&page=2')
        .set('Authorization', c.auth)
        .expect(200);
      expect(paged.body.items.map((r: { message: string }) => r.message)).toEqual(['uno']);
    });

    it('filtra por destinatario (toUserId) y la respuesta no trae conteos por persona', async () => {
      const a = await as();
      const b = await as();
      await give(a.auth, { toUserId: b.user.id, message: 'para b' }).expect(201);
      await give(b.auth, { toUserId: a.user.id, message: 'para a' }).expect(201);
      const res = await http()
        .get(`/recognitions?toUserId=${b.user.id}`)
        .set('Authorization', a.auth)
        .expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(Object.keys(res.body).sort()).toEqual(['items', 'limit', 'page', 'total']);
    });

    it('no existen endpoints de ranking / leaderboard / estadísticas', async () => {
      const a = await as();
      for (const path of [
        '/recognitions/leaderboard',
        '/recognitions/ranking',
        '/recognitions/stats',
        '/recognitions/top',
      ]) {
        await http()
          .get(path)
          .set('Authorization', a.auth)
          .expect((res) => {
            // /recognitions/:algo no existe como ruta (solo hay lista y alta): 404.
            expect(res.status).toBe(404);
          });
      }
    });

    it('sin token -> 401', async () => {
      await http().get('/recognitions').expect(401);
    });
  });

  it('la BD rechaza el autoreconocimiento aunque se salte la API (CHECK from<>to)', async () => {
    const a = await as();
    await expect(
      prisma.$executeRaw`INSERT INTO "Recognition" ("id","fromUserId","toUserId","message","milestoneVerified")
        VALUES (gen_random_uuid(), ${a.user.id}::uuid, ${a.user.id}::uuid, 'x', false)`,
    ).rejects.toMatchObject({ meta: { code: '23514' } });
  });
});
