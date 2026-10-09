import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { bearer } from './helpers/auth';
import { truncateAll } from './helpers/db';
import { createCycle, createObjective, createUser } from './helpers/factories';

const MISSING_ID = '6f1c2f0e-3b8d-4a52-9c5e-1d2a3b4c5d6e';

describe('Cycles (e2e)', () => {
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

  const annual = {
    name: 'Anual 2026',
    kind: 'ANNUAL',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  };

  const postCycle = (auth: string, body: object) =>
    http().post('/cycles').set('Authorization', auth).send(body);

  const createAnnual = async (auth: string) =>
    (await postCycle(auth, annual).expect(201)).body as { id: string };

  describe('POST /cycles (REQ-CYC-1, REQ-CYC-2)', () => {
    it('ADMIN crea un ANNUAL -> 201 con defaults: DRAFT, WEEKLY, umbrales 1.0 y 0.7', async () => {
      const { auth } = await as('ADMIN');
      const res = await postCycle(auth, annual).expect(201);
      expect(res.body).toMatchObject({
        name: 'Anual 2026',
        kind: 'ANNUAL',
        parentId: null,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        status: 'DRAFT',
        checkInCadence: 'WEEKLY',
        committedThreshold: 1,
        aspirationalThreshold: 0.7,
        closedAt: null,
      });
    });

    it('LEADER -> 403, MEMBER -> 403, sin token -> 401', async () => {
      const leader = await as('LEADER');
      const member = await as('MEMBER');
      await postCycle(leader.auth, annual).expect(403);
      await postCycle(member.auth, annual).expect(403);
      await http().post('/cycles').send(annual).expect(401);
    });

    it('QUARTER dentro del ANNUAL -> 201', async () => {
      const { auth } = await as('ADMIN');
      const parent = await createAnnual(auth);
      const res = await postCycle(auth, {
        name: 'Q1',
        kind: 'QUARTER',
        parentId: parent.id,
        startDate: '2026-01-01',
        endDate: '2026-03-31',
      }).expect(201);
      expect(res.body).toMatchObject({ kind: 'QUARTER', parentId: parent.id });
    });

    it('QUARTER fuera de las fechas del ANNUAL -> 400', async () => {
      const { auth } = await as('ADMIN');
      const parent = await createAnnual(auth);
      await postCycle(auth, {
        name: 'Q4',
        kind: 'QUARTER',
        parentId: parent.id,
        startDate: '2026-10-01',
        endDate: '2027-01-15',
      }).expect(400);
    });

    it('end <= start -> 400', async () => {
      const { auth } = await as('ADMIN');
      await postCycle(auth, { ...annual, startDate: '2026-06-01', endDate: '2026-06-01' }).expect(
        400,
      );
      await postCycle(auth, { ...annual, startDate: '2026-06-02', endDate: '2026-06-01' }).expect(
        400,
      );
    });

    it('QUARTER sin padre, ANNUAL con padre -> 400; padre inexistente -> 404', async () => {
      const { auth } = await as('ADMIN');
      const parent = await createAnnual(auth);
      await postCycle(auth, {
        name: 'Q1',
        kind: 'QUARTER',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
      }).expect(400);
      await postCycle(auth, { ...annual, name: 'Otro anual', parentId: parent.id }).expect(400);
      await postCycle(auth, {
        name: 'Q1',
        kind: 'QUARTER',
        parentId: MISSING_ID,
        startDate: '2026-01-01',
        endDate: '2026-03-31',
      }).expect(404);
    });

    it('QUARTER hermanos que se solapan -> 422; contiguos sin solape -> 201', async () => {
      const { auth } = await as('ADMIN');
      const parent = await createAnnual(auth);
      const q = (name: string, startDate: string, endDate: string) =>
        postCycle(auth, { name, kind: 'QUARTER', parentId: parent.id, startDate, endDate });
      await q('Q1', '2026-01-01', '2026-03-31').expect(201);
      await q('Q1 bis', '2026-03-31', '2026-05-01').expect(422);
      await q('Q2', '2026-04-01', '2026-06-30').expect(201);
    });

    it('umbrales personalizados válidos y cadencia -> 201', async () => {
      const { auth } = await as('ADMIN');
      const res = await postCycle(auth, {
        ...annual,
        checkInCadence: 'BIWEEKLY',
        committedThreshold: 0.9,
        aspirationalThreshold: 0.5,
      }).expect(201);
      expect(res.body).toMatchObject({
        checkInCadence: 'BIWEEKLY',
        committedThreshold: 0.9,
        aspirationalThreshold: 0.5,
      });
    });

    it('umbral 1.2, 0, negativo o con 3 decimales -> 400', async () => {
      const { auth } = await as('ADMIN');
      for (const committedThreshold of [1.2, 0, -0.1, 0.555]) {
        await postCycle(auth, { ...annual, committedThreshold }).expect(400);
      }
      await postCycle(auth, { ...annual, aspirationalThreshold: 0 }).expect(400);
    });

    it('fecha inexistente, formato inválido, campos extra o enum inválido -> 400', async () => {
      const { auth } = await as('ADMIN');
      await postCycle(auth, { ...annual, startDate: '2026-02-30' }).expect(400);
      await postCycle(auth, { ...annual, startDate: '01/01/2026' }).expect(400);
      await postCycle(auth, { ...annual, status: 'ACTIVE' }).expect(400);
      await postCycle(auth, { ...annual, kind: 'MONTH' }).expect(400);
      await postCycle(auth, { ...annual, checkInCadence: 'DAILY' }).expect(400);
    });
  });

  describe('GET /cycles', () => {
    it('cualquier autenticado lista (por fecha de inicio) y obtiene el detalle; 404 y 400 correctos', async () => {
      const { auth } = await as('MEMBER');
      const later = await createCycle(prisma, {
        name: 'B',
        startDate: new Date('2027-01-01'),
        endDate: new Date('2027-12-31'),
      });
      const first = await createCycle(prisma, { name: 'A' });

      const list = await http().get('/cycles').set('Authorization', auth).expect(200);
      expect((list.body as { id: string }[]).map((c) => c.id)).toEqual([first.id, later.id]);

      const one = await http().get(`/cycles/${first.id}`).set('Authorization', auth).expect(200);
      expect(one.body).toMatchObject({ id: first.id, startDate: '2026-01-01' });
      await http().get(`/cycles/${MISSING_ID}`).set('Authorization', auth).expect(404);
      await http().get('/cycles/no-uuid').set('Authorization', auth).expect(400);
      await http().get('/cycles').expect(401);
    });
  });

  describe('PATCH /cycles/:id', () => {
    it('LEADER no puede cambiar umbrales -> 403 (REQ-CYC-2)', async () => {
      const { auth } = await as('LEADER');
      const cycle = await createCycle(prisma);
      await http()
        .patch(`/cycles/${cycle.id}`)
        .set('Authorization', auth)
        .send({ committedThreshold: 0.5 })
        .expect(403);
    });

    it('ADMIN cambia umbrales: 200 y AuditLog CYCLE_THRESHOLDS_CHANGED con antes/después', async () => {
      const { auth, user } = await as('ADMIN');
      const cycle = await createCycle(prisma);
      const res = await http()
        .patch(`/cycles/${cycle.id}`)
        .set('Authorization', auth)
        .send({ committedThreshold: 0.85 })
        .expect(200);
      expect(res.body).toMatchObject({ committedThreshold: 0.85, aspirationalThreshold: 0.7 });

      const audit = await prisma.auditLog.findMany({
        where: { action: 'CYCLE_THRESHOLDS_CHANGED' },
      });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        actorId: user.id,
        entityType: 'Cycle',
        entityId: cycle.id,
        before: { committedThreshold: 1, aspirationalThreshold: 0.7 },
        after: { committedThreshold: 0.85, aspirationalThreshold: 0.7 },
      });
    });

    it('cambiar solo cadencia o nombre no audita umbrales; umbral inválido -> 400; campo de objetivo -> 400', async () => {
      const { auth } = await as('ADMIN');
      const cycle = await createCycle(prisma);
      const patch = (body: object) =>
        http().patch(`/cycles/${cycle.id}`).set('Authorization', auth).send(body);
      await patch({ checkInCadence: 'MONTHLY', name: 'Renombrado' }).expect(200);
      expect(await prisma.auditLog.count()).toBe(0);
      await patch({ aspirationalThreshold: 1.5 }).expect(400);
      await patch({ threshold: 0.5 }).expect(400);
    });

    it('fechas: editables en DRAFT con validación de jerarquía; en ACTIVE -> 409', async () => {
      const { auth } = await as('ADMIN');
      const parent = await createAnnual(auth);
      const q = (
        await postCycle(auth, {
          name: 'Q1',
          kind: 'QUARTER',
          parentId: parent.id,
          startDate: '2026-01-01',
          endDate: '2026-03-31',
        }).expect(201)
      ).body as { id: string };
      const patch = (id: string, body: object) =>
        http().patch(`/cycles/${id}`).set('Authorization', auth).send(body);

      await patch(q.id, { endDate: '2026-04-15' }).expect(200);
      await patch(q.id, { endDate: '2027-02-01' }).expect(400); // fuera del ANNUAL
      await patch(q.id, { startDate: '2026-05-01' }).expect(400); // start > end

      await http().post(`/cycles/${q.id}/activate`).set('Authorization', auth).expect(200);
      await patch(q.id, { endDate: '2026-04-20' }).expect(409);
      await patch(q.id, { committedThreshold: 0.9 }).expect(200); // umbrales sí, hasta el cierre
    });

    it('acortar un ANNUAL que dejaría a un QUARTER hijo fuera de rango -> 400', async () => {
      const { auth } = await as('ADMIN');
      const parent = await createAnnual(auth);
      await postCycle(auth, {
        name: 'Q4',
        kind: 'QUARTER',
        parentId: parent.id,
        startDate: '2026-10-01',
        endDate: '2026-12-31',
      }).expect(201);
      await http()
        .patch(`/cycles/${parent.id}`)
        .set('Authorization', auth)
        .send({ endDate: '2026-09-30' })
        .expect(400);
    });

    it('ciclo CERRADO es inmutable -> 409; inexistente -> 404', async () => {
      const { auth } = await as('ADMIN');
      const closed = await prisma.cycle.create({
        data: {
          name: 'Viejo',
          kind: 'ANNUAL',
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
          status: 'CLOSED',
          closedAt: new Date(),
        },
      });
      await http()
        .patch(`/cycles/${closed.id}`)
        .set('Authorization', auth)
        .send({ committedThreshold: 0.5 })
        .expect(409);
      await http()
        .patch(`/cycles/${MISSING_ID}`)
        .set('Authorization', auth)
        .send({ name: 'X' })
        .expect(404);
    });
  });

  describe('POST /cycles/:id/activate', () => {
    it('DRAFT -> ACTIVE con AuditLog CYCLE_ACTIVATED; repetir -> 422; MEMBER -> 403', async () => {
      const { auth, user } = await as('ADMIN');
      const member = await as('MEMBER');
      const cycle = await createCycle(prisma);

      await http()
        .post(`/cycles/${cycle.id}/activate`)
        .set('Authorization', member.auth)
        .expect(403);
      const res = await http()
        .post(`/cycles/${cycle.id}/activate`)
        .set('Authorization', auth)
        .expect(200);
      expect(res.body.status).toBe('ACTIVE');

      const audit = await prisma.auditLog.findMany({ where: { action: 'CYCLE_ACTIVATED' } });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ actorId: user.id, entityId: cycle.id });

      await http().post(`/cycles/${cycle.id}/activate`).set('Authorization', auth).expect(422);
      await http().post(`/cycles/${MISSING_ID}/activate`).set('Authorization', auth).expect(404);
    });
  });

  describe('POST /cycles/:id/close (REQ-SCORE-3)', () => {
    const publishedObjective = async (
      cycleId: string,
      createdById: string,
      type: 'COMMITTED' | 'ASPIRATIONAL',
      score: number,
    ) => {
      const objective = await createObjective(prisma, {
        cycleId,
        createdById,
        ownerUserId: createdById,
        type,
      });
      return prisma.objective.update({
        where: { id: objective.id },
        data: { status: 'PUBLISHED', publishedAt: new Date(), score },
      });
    };

    const activeCycle = (
      over: Partial<{ committedThreshold: number; aspirationalThreshold: number }> = {},
    ) =>
      prisma.cycle.create({
        data: {
          name: 'Activo',
          kind: 'ANNUAL',
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-12-31'),
          status: 'ACTIVE',
          ...over,
        },
      });

    it('COMMITTED 0.9 con umbral 1.0 -> no logrado; ASPIRATIONAL 0.7 con umbral 0.7 -> logrado (borde inclusivo)', async () => {
      const { auth, user } = await as('ADMIN');
      const cycle = await activeCycle();
      const committed = await publishedObjective(cycle.id, user.id, 'COMMITTED', 0.9);
      const aspirational = await publishedObjective(cycle.id, user.id, 'ASPIRATIONAL', 0.7);

      const res = await http()
        .post(`/cycles/${cycle.id}/close`)
        .set('Authorization', auth)
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'CLOSED',
        closedObjectives: 2,
        achievedObjectives: 1,
      });
      expect(res.body.closedAt).toEqual(expect.any(String));

      const c = await prisma.objective.findUniqueOrThrow({ where: { id: committed.id } });
      expect(c).toMatchObject({ status: 'CLOSED', achieved: false });
      expect(Number(c.finalScore)).toBe(0.9);
      expect(c.closedAt).not.toBeNull();
      const a = await prisma.objective.findUniqueOrThrow({ where: { id: aspirational.id } });
      expect(a).toMatchObject({ status: 'CLOSED', achieved: true });
      expect(Number(a.finalScore)).toBe(0.7);
    });

    it('usa el umbral vigente AL CIERRE: ADMIN baja el umbral a 0.85 antes de cerrar -> COMMITTED 0.9 logrado', async () => {
      const { auth, user } = await as('ADMIN');
      const cycle = await activeCycle();
      const objective = await publishedObjective(cycle.id, user.id, 'COMMITTED', 0.9);

      await http()
        .patch(`/cycles/${cycle.id}`)
        .set('Authorization', auth)
        .send({ committedThreshold: 0.85 })
        .expect(200);
      await http().post(`/cycles/${cycle.id}/close`).set('Authorization', auth).expect(200);

      const row = await prisma.objective.findUniqueOrThrow({ where: { id: objective.id } });
      expect(row.achieved).toBe(true);
    });

    it('registra AuditLog CYCLE_CLOSED (con umbrales usados) y OBJECTIVE_CLOSED por objetivo', async () => {
      const { auth, user } = await as('ADMIN');
      const cycle = await activeCycle({ committedThreshold: 0.8, aspirationalThreshold: 0.6 });
      const o1 = await publishedObjective(cycle.id, user.id, 'COMMITTED', 0.8);
      await publishedObjective(cycle.id, user.id, 'ASPIRATIONAL', 0.5);

      await http().post(`/cycles/${cycle.id}/close`).set('Authorization', auth).expect(200);

      const closedCycle = await prisma.auditLog.findMany({ where: { action: 'CYCLE_CLOSED' } });
      expect(closedCycle).toHaveLength(1);
      expect(closedCycle[0]).toMatchObject({
        actorId: user.id,
        entityType: 'Cycle',
        entityId: cycle.id,
        after: {
          committedThreshold: 0.8,
          aspirationalThreshold: 0.6,
          closedObjectives: 2,
          achievedObjectives: 1,
        },
      });
      const objectives = await prisma.auditLog.findMany({ where: { action: 'OBJECTIVE_CLOSED' } });
      expect(objectives).toHaveLength(2);
      const forO1 = objectives.find((x) => x.entityId === o1.id);
      expect(forO1).toMatchObject({
        entityType: 'Objective',
        actorId: user.id,
        before: { status: 'PUBLISHED' },
        after: { status: 'CLOSED', finalScore: 0.8, achieved: true },
      });
    });

    it('los DRAFT no se cierran ni puntúan; los de otros ciclos no se tocan', async () => {
      const { auth, user } = await as('ADMIN');
      const cycle = await activeCycle();
      const other = await activeCycle();
      const draft = await createObjective(prisma, {
        cycleId: cycle.id,
        createdById: user.id,
        ownerUserId: user.id,
      });
      const foreign = await publishedObjective(other.id, user.id, 'COMMITTED', 1);

      const res = await http()
        .post(`/cycles/${cycle.id}/close`)
        .set('Authorization', auth)
        .expect(200);
      expect(res.body).toMatchObject({ closedObjectives: 0, achievedObjectives: 0 });
      expect((await prisma.objective.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe(
        'DRAFT',
      );
      expect((await prisma.objective.findUniqueOrThrow({ where: { id: foreign.id } })).status).toBe(
        'PUBLISHED',
      );
    });

    it('solo se cierra un ciclo ACTIVE: DRAFT o CLOSED -> 422; MEMBER -> 403; inexistente -> 404', async () => {
      const { auth } = await as('ADMIN');
      const member = await as('MEMBER');
      const draft = await createCycle(prisma);
      await http().post(`/cycles/${draft.id}/close`).set('Authorization', auth).expect(422);

      const active = await activeCycle();
      await http().post(`/cycles/${active.id}/close`).set('Authorization', member.auth).expect(403);
      await http().post(`/cycles/${active.id}/close`).set('Authorization', auth).expect(200);
      await http().post(`/cycles/${active.id}/close`).set('Authorization', auth).expect(422);
      await http().post(`/cycles/${MISSING_ID}/close`).set('Authorization', auth).expect(404);
    });
  });
});
