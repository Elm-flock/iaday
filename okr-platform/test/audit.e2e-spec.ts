import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { bearer } from './helpers/auth';
import { truncateAll } from './helpers/db';
import { createUser, uuid } from './helpers/factories';

/** SQLSTATE de un error de Prisma por query raw (P2010 -> meta.code). */
async function sqlState(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error: any) {
    return error?.meta?.code ?? error?.code;
  }
}

describe('Auditoría (e2e) REQ-AUD-1', () => {
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

  const as = async (role: 'ADMIN' | 'LEADER' | 'MEMBER') => {
    const user = await createUser(prisma, { role });
    return { user, auth: await bearer(app, user) };
  };

  const log = (
    over: Partial<{
      actorId: string | null;
      action: 'KR_SCORE_CHANGED' | 'CYCLE_CLOSED' | 'KR_TARGET_CHANGED';
      entityType: string;
      entityId: string;
      createdAt: Date;
    }> = {},
  ) =>
    prisma.auditLog.create({
      data: {
        actorId: null,
        action: 'KR_SCORE_CHANGED',
        entityType: 'KeyResult',
        entityId: uuid(),
        before: { score: 0 },
        after: { score: 0.5 },
        ...over,
      },
    });

  describe('GET /audit', () => {
    it('ADMIN lista paginado, del más nuevo al más viejo, con total', async () => {
      const { auth } = await as('ADMIN');
      for (let i = 0; i < 5; i++) await log({ createdAt: new Date(Date.UTC(2026, 0, 1 + i)) });

      const res = await http().get('/audit?limit=2').set('Authorization', auth).expect(200);
      expect(res.body).toMatchObject({ total: 5, page: 1, limit: 2 });
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].createdAt).toBe('2026-01-05T00:00:00.000Z');
      expect(res.body.items[0]).toMatchObject({
        action: 'KR_SCORE_CHANGED',
        entityType: 'KeyResult',
        before: { score: 0 },
        after: { score: 0.5 },
      });

      const page3 = await http()
        .get('/audit?limit=2&page=3')
        .set('Authorization', auth)
        .expect(200);
      expect(page3.body.items).toHaveLength(1);
      expect(page3.body.items[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('filtra por entidad, actor, acción y rango de fechas', async () => {
      const { auth } = await as('ADMIN');
      const actor = await createUser(prisma);
      const entityId = uuid();
      await log({ entityId, actorId: actor.id, createdAt: new Date('2026-03-01T00:00:00Z') });
      await log({
        entityType: 'Cycle',
        action: 'CYCLE_CLOSED',
        createdAt: new Date('2026-03-10T00:00:00Z'),
      });
      await log({ action: 'KR_TARGET_CHANGED', createdAt: new Date('2026-04-01T00:00:00Z') });
      const get = async (qs: string) =>
        (await http().get(`/audit?${qs}`).set('Authorization', auth).expect(200)).body;

      expect((await get(`entityId=${entityId}`)).total).toBe(1);
      expect((await get('entityType=Cycle')).total).toBe(1);
      expect((await get(`actorId=${actor.id}`)).total).toBe(1);
      expect((await get('action=KR_TARGET_CHANGED')).total).toBe(1);
      expect((await get('from=2026-03-05T00:00:00Z')).total).toBe(2);
      expect((await get('to=2026-03-05T00:00:00Z')).total).toBe(1);
      expect((await get('from=2026-03-05T00:00:00Z&to=2026-03-20T00:00:00Z')).total).toBe(1);
      expect((await get('entityType=KeyResult&action=KR_SCORE_CHANGED')).total).toBe(1);
    });

    it('parámetros inválidos -> 400', async () => {
      const { auth } = await as('ADMIN');
      for (const qs of [
        'action=NOPE',
        'from=ayer',
        'to=mañana',
        'actorId=no-uuid',
        'entityId=no-uuid',
        'limit=0',
        'limit=101',
        'page=0',
        'cosa=1',
      ]) {
        await http().get(`/audit?${qs}`).set('Authorization', auth).expect(400);
      }
    });

    it('solo ADMIN: MEMBER y LEADER -> 403, sin token -> 401', async () => {
      const member = await as('MEMBER');
      const leader = await as('LEADER');
      await http().get('/audit').set('Authorization', member.auth).expect(403);
      await http().get('/audit').set('Authorization', leader.auth).expect(403);
      await http().get('/audit').expect(401);
    });

    it('append-only por API: no existen POST/PUT/PATCH/DELETE sobre /audit', async () => {
      const { auth } = await as('ADMIN');
      const entry = await log();
      await http().post('/audit').set('Authorization', auth).send({}).expect(404);
      await http().put(`/audit/${entry.id}`).set('Authorization', auth).send({}).expect(404);
      await http().patch(`/audit/${entry.id}`).set('Authorization', auth).send({}).expect(404);
      await http().delete(`/audit/${entry.id}`).set('Authorization', auth).expect(404);
      expect(await prisma.auditLog.count()).toBe(1);
    });
  });

  describe('append-only a nivel BD (trigger)', () => {
    it('UPDATE y DELETE directos sobre AuditLog son rechazados', async () => {
      const entry = await log();
      const update = await sqlState(
        prisma.$executeRaw`UPDATE "AuditLog" SET "entityType" = 'X' WHERE "id" = ${entry.id}::uuid`,
      );
      const del = await sqlState(
        prisma.$executeRaw`DELETE FROM "AuditLog" WHERE "id" = ${entry.id}::uuid`,
      );
      expect(update).toBeDefined();
      expect(del).toBeDefined();
      const after = await prisma.auditLog.findUniqueOrThrow({ where: { id: entry.id } });
      expect(after.entityType).toBe('KeyResult');
    });

    it('INSERT sigue permitido y borrar al actor conserva la entrada (actorId -> null)', async () => {
      const actor = await createUser(prisma);
      const entry = await log({ actorId: actor.id });
      await prisma.user.delete({ where: { id: actor.id } });
      const after = await prisma.auditLog.findUniqueOrThrow({ where: { id: entry.id } });
      expect(after.actorId).toBeNull();
    });
  });
});
