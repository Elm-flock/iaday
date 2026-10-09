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

const MISSING_ID = '6f1c2f0e-3b8d-4a52-9c5e-1d2a3b4c5d6e';

describe('Key results (e2e)', () => {
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

  const draftOf = async (ownerUserId: string, cycleId?: string) => {
    const cycle = cycleId ? { id: cycleId } : await createCycle(prisma);
    return createObjective(prisma, { cycleId: cycle.id, createdById: ownerUserId, ownerUserId });
  };
  const publishedOf = async (ownerUserId: string, cycleId?: string) => {
    const o = await draftOf(ownerUserId, cycleId);
    return prisma.objective.update({
      where: { id: o.id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
  };

  const krBody = (ownerId: string, extra: object = {}) => ({
    title: 'Llegar a 100 clientes',
    ownerId,
    scoring: 'DERIVED',
    unit: 'clientes',
    startValue: '0',
    targetValue: '100',
    ...extra,
  });
  const postKr = (auth: string, objectiveId: string, payload: object) =>
    http().post(`/objectives/${objectiveId}/key-results`).set('Authorization', auth).send(payload);
  const patchKr = (auth: string, id: string, payload: object) =>
    http().patch(`/key-results/${id}`).set('Authorization', auth).send(payload);

  describe('POST /objectives/:id/key-results (REQ-OKR-3)', () => {
    it('owner crea un KR numérico en su DRAFT -> 201 con score 0, posición 1 y valor actual = inicio', async () => {
      const { user, auth } = await as('MEMBER');
      const o = await draftOf(user.id);
      const res = await postKr(auth, o.id, krBody(user.id)).expect(201);
      expect(res.body).toMatchObject({
        objectiveId: o.id,
        ownerId: user.id,
        title: 'Llegar a 100 clientes',
        scoring: 'DERIVED',
        unit: 'clientes',
        startValue: '0',
        targetValue: '100',
        currentValue: '0',
        score: 0,
        position: 1,
        lastCheckInAt: null,
      });
      const second = await postKr(auth, o.id, krBody(user.id)).expect(201);
      expect(second.body.position).toBe(2);
    });

    it('sin token -> 401', async () => {
      await http().post(`/objectives/${MISSING_ID}/key-results`).send({}).expect(401);
    });

    it('target < start (métrica a la baja) -> 201; KR binario MANUAL sin valores -> 201', async () => {
      const { user, auth } = await as('MEMBER');
      const o = await draftOf(user.id);
      await postKr(auth, o.id, krBody(user.id, { startValue: '100', targetValue: '60' })).expect(
        201,
      );
      const binary = await postKr(auth, o.id, {
        title: 'Certificación obtenida',
        ownerId: user.id,
        scoring: 'MANUAL',
      }).expect(201);
      expect(binary.body).toMatchObject({
        scoring: 'MANUAL',
        startValue: null,
        targetValue: null,
        currentValue: null,
      });
    });

    it('NUMERIC con start == target -> 400 INVALID_KR_RANGE', async () => {
      const { user, auth } = await as('MEMBER');
      const o = await draftOf(user.id);
      const res = await postKr(
        auth,
        o.id,
        krBody(user.id, { startValue: '100', targetValue: '100.00' }),
      ).expect(400);
      expect(res.body.code).toBe('INVALID_KR_RANGE');
    });

    it('NUMERIC sin start/target -> 400; MANUAL con valores -> 400', async () => {
      const { user, auth } = await as('MEMBER');
      const o = await draftOf(user.id);
      await postKr(auth, o.id, {
        title: 'KR sin metas',
        ownerId: user.id,
        scoring: 'DERIVED',
      }).expect(400);
      await postKr(auth, o.id, {
        title: 'KR binario con metas',
        ownerId: user.id,
        scoring: 'MANUAL',
        targetValue: '1',
      }).expect(400);
    });

    it('validaciones de forma: decimales inválidos, scoring inválido, sin título, campos extra -> 400', async () => {
      const { user, auth } = await as('MEMBER');
      const o = await draftOf(user.id);
      const bad: object[] = [
        krBody(user.id, { targetValue: 'abc' }),
        krBody(user.id, { targetValue: '1.23456' }),
        krBody(user.id, { scoring: 'BINARY' }),
        krBody(user.id, { title: '' }),
        krBody(user.id, { ownerId: 'no-uuid' }),
        krBody(user.id, { score: 1 }),
        krBody(user.id, { currentValue: '50' }),
      ];
      for (const payload of bad) await postKr(auth, o.id, payload).expect(400);
    });

    it('KR owner inexistente -> 404; objetivo inexistente -> 404', async () => {
      const { user, auth } = await as('MEMBER');
      const o = await draftOf(user.id);
      await postKr(auth, o.id, krBody(MISSING_ID)).expect(404);
      await postKr(auth, MISSING_ID, krBody(user.id)).expect(404);
    });

    it('el 6to KR -> 422 KR_LIMIT_EXCEEDED', async () => {
      const { user, auth } = await as('MEMBER');
      const o = await draftOf(user.id);
      for (let i = 0; i < 5; i++) await postKr(auth, o.id, krBody(user.id)).expect(201);
      const res = await postKr(auth, o.id, krBody(user.id)).expect(422);
      expect(res.body.code).toBe('KR_LIMIT_EXCEEDED');
    });

    it('altas concurrentes no superan los 5 KRs', async () => {
      const { user, auth } = await as('MEMBER');
      const o = await draftOf(user.id);
      const results = await Promise.all(
        Array.from({ length: 8 }, () => postKr(auth, o.id, krBody(user.id))),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(5);
      expect(results.filter((r) => r.status === 422)).toHaveLength(3);
      const positions = (await prisma.keyResult.findMany({ where: { objectiveId: o.id } }))
        .map((k) => k.position)
        .sort();
      expect(positions).toEqual([1, 2, 3, 4, 5]);
    });

    it('MEMBER ajeno -> 403 sobre PUBLISHED y 404 sobre DRAFT', async () => {
      const { user, auth } = await as('MEMBER');
      const owner = await createUser(prisma);
      const pub = await publishedOf(owner.id);
      const draft = await draftOf(owner.id);
      await postKr(auth, pub.id, krBody(user.id)).expect(403);
      await postKr(auth, draft.id, krBody(user.id)).expect(404);
    });

    it('LEADER del equipo owner agrega KRs al objetivo del equipo', async () => {
      const { user: leader, auth } = await as('LEADER');
      const team = await createTeam(prisma);
      await prisma.teamMember.create({
        data: { userId: leader.id, teamId: team.id, isLead: true },
      });
      const cycle = await createCycle(prisma);
      const o = await createObjective(prisma, {
        cycleId: cycle.id,
        createdById: leader.id,
        ownerTeamId: team.id,
      });
      await postKr(auth, o.id, krBody(leader.id)).expect(201);
    });

    it('objetivo CLOSED -> 409; ciclo CLOSED -> 409', async () => {
      const { user, auth } = await as('MEMBER');
      const closedObj = await publishedOf(user.id);
      await prisma.objective.update({ where: { id: closedObj.id }, data: { status: 'CLOSED' } });
      await postKr(auth, closedObj.id, krBody(user.id)).expect(409);
      const inClosedCycle = await draftOf(user.id);
      await prisma.cycle.update({
        where: { id: inClosedCycle.cycleId },
        data: { status: 'CLOSED' },
      });
      await postKr(auth, inClosedCycle.id, krBody(user.id)).expect(409);
    });

    it('en un objetivo PUBLISHED se puede agregar y el score del objetivo se recalcula', async () => {
      const { user, auth } = await as('MEMBER');
      const o = await publishedOf(user.id);
      const first = await createKeyResult(prisma, { objectiveId: o.id, ownerId: user.id });
      await prisma.keyResult.update({ where: { id: first.id }, data: { score: 1 } });
      await prisma.objective.update({ where: { id: o.id }, data: { score: 1 } });
      await postKr(auth, o.id, krBody(user.id, { startValue: '5', targetValue: '10' })).expect(201);
      const refreshed = await prisma.objective.findUniqueOrThrow({ where: { id: o.id } });
      expect(Number(refreshed.score)).toBe(0.5);
    });
  });

  describe('PATCH /key-results/:id', () => {
    const seed = async (published: boolean) => {
      const owner = await createUser(prisma, { name: 'Dueña' });
      const o = published ? await publishedOf(owner.id) : await draftOf(owner.id);
      const kr = await createKeyResult(prisma, {
        objectiveId: o.id,
        ownerId: owner.id,
        startValue: 0,
        targetValue: 100,
      });
      await prisma.keyResult.update({
        where: { id: kr.id },
        data: { currentValue: 50, score: 0.5 },
      });
      await prisma.objective.update({ where: { id: o.id }, data: { score: 0.5 } });
      return { owner, ownerAuth: await bearer(app, owner), objective: o, kr };
    };

    it('DRAFT: owner edita título, unidad, KR owner, start y target libremente -> 200 sin auditoría', async () => {
      const { ownerAuth, kr } = await seed(false);
      const other = await createUser(prisma);
      const res = await patchKr(ownerAuth, kr.id, {
        title: 'Nuevo título',
        unit: 'usuarios',
        ownerId: other.id,
        startValue: '10',
        targetValue: '200',
      }).expect(200);
      expect(res.body).toMatchObject({
        title: 'Nuevo título',
        unit: 'usuarios',
        ownerId: other.id,
        startValue: '10',
        targetValue: '200',
      });
      expect(await prisma.auditLog.count({ where: { action: 'KR_TARGET_CHANGED' } })).toBe(0);
    });

    it('PUBLISHED: el owner (MEMBER) puede cambiar el título pero NO la meta -> 403', async () => {
      const { ownerAuth, kr } = await seed(true);
      await patchKr(ownerAuth, kr.id, { title: 'Otro título' }).expect(200);
      await patchKr(ownerAuth, kr.id, { targetValue: '200' }).expect(403);
      await patchKr(ownerAuth, kr.id, { startValue: '5' }).expect(403);
      expect(await prisma.auditLog.count()).toBe(0);
    });

    it('PUBLISHED: ADMIN cambia la meta -> 200, score del KR y del objetivo recalculados, AuditLog con antes y después', async () => {
      const { user: admin, auth } = await as('ADMIN');
      const { kr, objective } = await seed(true);
      const res = await patchKr(auth, kr.id, { targetValue: '200' }).expect(200);
      expect(res.body).toMatchObject({ targetValue: '200', currentValue: '50', score: 0.25 });
      expect(
        Number((await prisma.objective.findUniqueOrThrow({ where: { id: objective.id } })).score),
      ).toBe(0.25);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'KR_TARGET_CHANGED', entityId: kr.id },
      });
      expect(audit.actorId).toBe(admin.id);
      expect(audit.entityType).toBe('KeyResult');
      expect(audit.before).toEqual({ startValue: '0', targetValue: '100', score: 0.5 });
      expect(audit.after).toEqual({ startValue: '0', targetValue: '200', score: 0.25 });
    });

    it('PUBLISHED: LEADER de un equipo del owner cambia la meta; pero no el título (no edita el objetivo)', async () => {
      const { user: leader, auth } = await as('LEADER');
      const { owner, kr } = await seed(true);
      const team = await createTeam(prisma);
      await prisma.teamMember.create({ data: { userId: owner.id, teamId: team.id } });
      await prisma.teamMember.create({
        data: { userId: leader.id, teamId: team.id, isLead: true },
      });
      await patchKr(auth, kr.id, { title: 'Intento' }).expect(403);
      await patchKr(auth, kr.id, { targetValue: '150' }).expect(200);
      expect(await prisma.auditLog.count({ where: { action: 'KR_TARGET_CHANGED' } })).toBe(1);
    });

    it('PUBLISHED: LEADER del equipo owner del objetivo cambia la meta -> 200', async () => {
      const { user: leader, auth } = await as('LEADER');
      const team = await createTeam(prisma);
      await prisma.teamMember.create({
        data: { userId: leader.id, teamId: team.id, isLead: true },
      });
      const cycle = await createCycle(prisma);
      const o = await createObjective(prisma, {
        cycleId: cycle.id,
        createdById: leader.id,
        ownerTeamId: team.id,
      });
      await prisma.objective.update({ where: { id: o.id }, data: { status: 'PUBLISHED' } });
      const kr = await createKeyResult(prisma, { objectiveId: o.id, ownerId: leader.id });
      await patchKr(auth, kr.id, { targetValue: '300' }).expect(200);
    });

    it('PUBLISHED: LEADER ajeno / MEMBER ajeno -> 403', async () => {
      const { auth: leaderAuth } = await as('LEADER');
      const { auth: memberAuth } = await as('MEMBER');
      const { kr } = await seed(true);
      await patchKr(leaderAuth, kr.id, { targetValue: '300' }).expect(403);
      await patchKr(memberAuth, kr.id, { targetValue: '300' }).expect(403);
    });

    it('enviar la misma meta no genera auditoría', async () => {
      const { auth } = await as('ADMIN');
      const { kr } = await seed(true);
      await patchKr(auth, kr.id, { targetValue: '100.0000', title: 'Mismo valor' }).expect(200);
      expect(await prisma.auditLog.count({ where: { action: 'KR_TARGET_CHANGED' } })).toBe(0);
    });

    it('start == target tras el cambio -> 400; en KR MANUAL no se puede fijar meta -> 400', async () => {
      const { auth } = await as('ADMIN');
      const { kr, owner, objective } = await seed(true);
      await patchKr(auth, kr.id, { targetValue: '0' }).expect(400);
      const binary = await prisma.keyResult.create({
        data: {
          objectiveId: objective.id,
          ownerId: owner.id,
          title: 'Binario',
          scoring: 'MANUAL',
          position: 2,
        },
      });
      await patchKr(auth, binary.id, { targetValue: '1' }).expect(400);
    });

    it('objetivo CLOSED -> 409 (incluso ADMIN)', async () => {
      const { auth } = await as('ADMIN');
      const { kr, objective } = await seed(true);
      await prisma.objective.update({ where: { id: objective.id }, data: { status: 'CLOSED' } });
      await patchKr(auth, kr.id, { targetValue: '300' }).expect(409);
      await patchKr(auth, kr.id, { title: 'No' }).expect(409);
    });

    it('DRAFT ajeno -> 404; KR inexistente -> 404; campos no declarados (score, objectiveId) -> 400', async () => {
      const { auth: strangerAuth } = await as('MEMBER');
      const { ownerAuth, kr } = await seed(false);
      await patchKr(strangerAuth, kr.id, { title: 'Hola' }).expect(404);
      await patchKr(ownerAuth, MISSING_ID, { title: 'Hola' }).expect(404);
      await patchKr(ownerAuth, kr.id, { score: 1 }).expect(400);
      await patchKr(ownerAuth, kr.id, { objectiveId: MISSING_ID }).expect(400);
    });
  });

  describe('DELETE /key-results/:id', () => {
    it('owner borra un KR de su DRAFT -> 204 y el score del objetivo se recalcula', async () => {
      const { user, auth } = await as('MEMBER');
      const o = await draftOf(user.id);
      const a = await createKeyResult(prisma, { objectiveId: o.id, ownerId: user.id, position: 1 });
      const b = await createKeyResult(prisma, { objectiveId: o.id, ownerId: user.id, position: 2 });
      await prisma.keyResult.update({ where: { id: a.id }, data: { score: 1 } });
      await prisma.objective.update({ where: { id: o.id }, data: { score: 0.5 } });
      await http().delete(`/key-results/${b.id}`).set('Authorization', auth).expect(204);
      expect(await prisma.keyResult.count({ where: { objectiveId: o.id } })).toBe(1);
      expect(
        Number((await prisma.objective.findUniqueOrThrow({ where: { id: o.id } })).score),
      ).toBe(1);
    });

    it('en PUBLISHED -> 409; ajeno -> 403 (PUBLISHED) / 404 (DRAFT); inexistente -> 404', async () => {
      const { user, auth } = await as('MEMBER');
      const other = await createUser(prisma);
      const mine = await publishedOf(user.id);
      const theirs = await publishedOf(other.id);
      const theirDraft = await draftOf(other.id);
      const krMine = await createKeyResult(prisma, { objectiveId: mine.id, ownerId: user.id });
      const krTheirs = await createKeyResult(prisma, { objectiveId: theirs.id, ownerId: other.id });
      const krDraft = await createKeyResult(prisma, {
        objectiveId: theirDraft.id,
        ownerId: other.id,
      });
      const del = (id: string) => http().delete(`/key-results/${id}`).set('Authorization', auth);
      await del(krMine.id).expect(409);
      await del(krTheirs.id).expect(403);
      await del(krDraft.id).expect(404);
      await del(MISSING_ID).expect(404);
    });
  });
});
