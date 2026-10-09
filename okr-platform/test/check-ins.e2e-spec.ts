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
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

describe('Check-ins (e2e) REQ-CHK-1 / REQ-CHK-2', () => {
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

  /** Objetivo individual con un KR numérico 0 -> 100. */
  const published = async (
    ownerUserId: string,
    opts: { cycleId?: string; status?: 'DRAFT' | 'PUBLISHED' | 'CLOSED'; krOwnerId?: string } = {},
  ) => {
    const cycleId = opts.cycleId ?? (await createCycle(prisma)).id;
    const objective = await createObjective(prisma, {
      cycleId,
      createdById: ownerUserId,
      ownerUserId,
    });
    await prisma.objective.update({
      where: { id: objective.id },
      data: { status: opts.status ?? 'PUBLISHED', publishedAt: new Date() },
    });
    const kr = await createKeyResult(prisma, {
      objectiveId: objective.id,
      ownerId: opts.krOwnerId ?? ownerUserId,
    });
    return { objective, kr, cycleId };
  };

  const postCheckIn = (auth: string, krId: string, payload: object) =>
    http().post(`/key-results/${krId}/check-ins`).set('Authorization', auth).send(payload);
  const valid = { value: '50', action: 'UPDATE', note: 'Vamos bien' };

  describe('POST /key-results/:id/check-ins', () => {
    it('owner registra un check-in -> 201 con snapshot, recalcula KR y objetivo y audita', async () => {
      const { user, auth } = await as('MEMBER');
      const { objective, kr } = await published(user.id);

      const res = await postCheckIn(auth, kr.id, valid).expect(201);
      expect(res.body).toMatchObject({
        keyResultId: kr.id,
        authorId: user.id,
        value: '50',
        score: 0.5,
        band: 'YELLOW',
        action: 'UPDATE',
        note: 'Vamos bien',
      });

      const krAfter = await prisma.keyResult.findUniqueOrThrow({ where: { id: kr.id } });
      expect(Number(krAfter.currentValue)).toBe(50);
      expect(Number(krAfter.score)).toBe(0.5);
      expect(krAfter.lastCheckInAt).not.toBeNull();
      const obj = await prisma.objective.findUniqueOrThrow({ where: { id: objective.id } });
      expect(Number(obj.score)).toBe(0.5);

      const audit = await prisma.auditLog.findMany({ where: { action: 'KR_SCORE_CHANGED' } });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        actorId: user.id,
        entityType: 'KeyResult',
        entityId: kr.id,
      });
      expect(audit[0].before).toMatchObject({ score: 0 });
      expect(audit[0].after).toMatchObject({ score: 0.5, value: '50' });
    });

    it('el score del objetivo es el promedio de sus KRs', async () => {
      const { user, auth } = await as('MEMBER');
      const { objective, kr } = await published(user.id);
      await createKeyResult(prisma, { objectiveId: objective.id, ownerId: user.id, position: 2 });
      await postCheckIn(auth, kr.id, { value: '100', action: 'UPDATE' }).expect(201);
      const obj = await prisma.objective.findUniqueOrThrow({ where: { id: objective.id } });
      expect(Number(obj.score)).toBe(0.5);
    });

    it('check-in que no cambia el score no genera auditoría', async () => {
      const { user, auth } = await as('MEMBER');
      const { kr } = await published(user.id);
      await postCheckIn(auth, kr.id, { value: '0', action: 'CONTINUE' }).expect(201);
      expect(await prisma.auditLog.count({ where: { action: 'KR_SCORE_CHANGED' } })).toBe(0);
    });

    it('KR binario: usa manualScore en pasos de 0.1 y banda GREEN con 0.7', async () => {
      const { user, auth } = await as('MEMBER');
      const { objective } = await published(user.id);
      const manual = await prisma.keyResult.create({
        data: {
          objectiveId: objective.id,
          ownerId: user.id,
          title: 'Lanzar',
          scoring: 'MANUAL',
          position: 2,
        },
      });
      const res = await postCheckIn(auth, manual.id, { manualScore: 0.7, action: 'START' }).expect(
        201,
      );
      expect(res.body).toMatchObject({ value: null, score: 0.7, band: 'GREEN', action: 'START' });
      await postCheckIn(auth, manual.id, { manualScore: 0.35, action: 'START' }).expect(400);
    });

    it('rechaza payloads incoherentes -> 400', async () => {
      const { user, auth } = await as('MEMBER');
      const { kr } = await published(user.id);
      await postCheckIn(auth, kr.id, { value: '5' }).expect(400); // sin acción
      await postCheckIn(auth, kr.id, { value: '5', action: 'EXPLODE' }).expect(400);
      await postCheckIn(auth, kr.id, { action: 'UPDATE' }).expect(400); // falta valor
      await postCheckIn(auth, kr.id, { value: 'abc', action: 'UPDATE' }).expect(400);
      await postCheckIn(auth, kr.id, { value: '5', manualScore: 0.5, action: 'UPDATE' }).expect(
        400,
      );
      await postCheckIn(auth, kr.id, { value: '5', action: 'UPDATE', extra: 1 }).expect(400);
      await postCheckIn(auth, kr.id, {
        value: '5',
        action: 'UPDATE',
        note: 'x'.repeat(2001),
      }).expect(400);
      expect(await prisma.checkIn.count()).toBe(0);
    });

    it('objetivo DRAFT -> 409; CLOSED -> 409; ciclo cerrado -> 409', async () => {
      const { user, auth } = await as('MEMBER');
      const draft = await published(user.id, { status: 'DRAFT' });
      await postCheckIn(auth, draft.kr.id, valid).expect(409);
      const closed = await published(user.id, { status: 'CLOSED' });
      await postCheckIn(auth, closed.kr.id, valid).expect(409);
      const cycle = await createCycle(prisma);
      const inClosedCycle = await published(user.id, { cycleId: cycle.id });
      await prisma.cycle.update({ where: { id: cycle.id }, data: { status: 'CLOSED' } });
      await postCheckIn(auth, inClosedCycle.kr.id, valid).expect(409);
      expect(await prisma.checkIn.count()).toBe(0);
    });

    it('permisos: owner del KR, miembros del equipo owner y su líder sí; ADMIN y ajenos no', async () => {
      const team = await createTeam(prisma);
      const leader = await as('LEADER');
      const member = await as('MEMBER');
      const krOwner = await as('MEMBER');
      const otherLeader = await as('LEADER');
      const admin = await as('ADMIN');
      await prisma.teamMember.createMany({
        data: [
          { userId: leader.user.id, teamId: team.id, isLead: true },
          { userId: member.user.id, teamId: team.id },
        ],
      });
      const cycle = await createCycle(prisma);
      const objective = await createObjective(prisma, {
        cycleId: cycle.id,
        createdById: leader.user.id,
        ownerTeamId: team.id,
      });
      await prisma.objective.update({
        where: { id: objective.id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
      const kr = await createKeyResult(prisma, {
        objectiveId: objective.id,
        ownerId: krOwner.user.id,
      });

      await postCheckIn(member.auth, kr.id, valid).expect(201);
      await postCheckIn(leader.auth, kr.id, valid).expect(201);
      await postCheckIn(krOwner.auth, kr.id, valid).expect(201);
      await postCheckIn(admin.auth, kr.id, valid).expect(403); // sin bypass
      await postCheckIn(otherLeader.auth, kr.id, valid).expect(403);
    });

    it('DRAFT ajeno -> 404; KR inexistente -> 404; sin token -> 401', async () => {
      const owner = await as('MEMBER');
      const stranger = await as('MEMBER');
      const draft = await published(owner.user.id, { status: 'DRAFT' });
      await postCheckIn(stranger.auth, draft.kr.id, valid).expect(404);
      await postCheckIn(owner.auth, MISSING_ID, valid).expect(404);
      await http().post(`/key-results/${draft.kr.id}/check-ins`).send(valid).expect(401);
    });

    it('snapshot inmutable: cambiar la meta después no altera el historial', async () => {
      const { user, auth } = await as('MEMBER');
      const admin = await as('ADMIN');
      const { kr } = await published(user.id);
      const created = await postCheckIn(auth, kr.id, valid).expect(201);
      await http()
        .patch(`/key-results/${kr.id}`)
        .set('Authorization', admin.auth)
        .send({ targetValue: '60' })
        .expect(200);
      const history = await http()
        .get(`/key-results/${kr.id}/check-ins`)
        .set('Authorization', auth)
        .expect(200);
      expect(history.body).toHaveLength(1);
      expect(history.body[0]).toMatchObject({ id: created.body.id, score: 0.5, band: 'YELLOW' });
    });

    it('check-ins concurrentes sobre KRs del mismo objetivo dejan el score del objetivo consistente', async () => {
      const { user, auth } = await as('MEMBER');
      const { objective, kr } = await published(user.id);
      const kr2 = await createKeyResult(prisma, {
        objectiveId: objective.id,
        ownerId: user.id,
        position: 2,
      });
      await Promise.all([
        postCheckIn(auth, kr.id, { value: '100', action: 'UPDATE' }).expect(201),
        postCheckIn(auth, kr2.id, { value: '40', action: 'UPDATE' }).expect(201),
        postCheckIn(auth, kr.id, { value: '100', action: 'CONTINUE' }).expect(201),
        postCheckIn(auth, kr2.id, { value: '60', action: 'UPDATE' }).expect(201),
      ]);
      const krs = await prisma.keyResult.findMany({ where: { objectiveId: objective.id } });
      const expected = krs.reduce((s, k) => s + Number(k.score), 0) / krs.length;
      const obj = await prisma.objective.findUniqueOrThrow({ where: { id: objective.id } });
      expect(Number(obj.score)).toBeCloseTo(expected, 4);
    });
  });

  describe('GET /key-results/:id/check-ins', () => {
    it('lista el historial del más nuevo al más viejo a cualquier autenticado', async () => {
      const { user, auth } = await as('MEMBER');
      const other = await as('MEMBER');
      const { kr } = await published(user.id);
      await postCheckIn(auth, kr.id, { value: '10', action: 'START' }).expect(201);
      await postCheckIn(auth, kr.id, { value: '30', action: 'UPDATE' }).expect(201);
      const res = await http()
        .get(`/key-results/${kr.id}/check-ins`)
        .set('Authorization', other.auth)
        .expect(200);
      expect(res.body.map((c: { value: string }) => c.value)).toEqual(['30', '10']);
    });

    it('DRAFT ajeno e inexistente -> 404; sin token -> 401', async () => {
      const owner = await as('MEMBER');
      const stranger = await as('MEMBER');
      const draft = await published(owner.user.id, { status: 'DRAFT' });
      await http()
        .get(`/key-results/${draft.kr.id}/check-ins`)
        .set('Authorization', stranger.auth)
        .expect(404);
      await http()
        .get(`/key-results/${MISSING_ID}/check-ins`)
        .set('Authorization', owner.auth)
        .expect(404);
      await http().get(`/key-results/${draft.kr.id}/check-ins`).expect(401);
    });
  });

  describe('GET /check-ins/pending (REQ-CHK-2)', () => {
    const pending = (auth: string) =>
      http().get('/check-ins/pending').set('Authorization', auth).expect(200);

    it('lista mis KRs vencidos (más de 7 días con cadencia semanal) y no los vigentes', async () => {
      const { user, auth } = await as('MEMBER');
      const { kr, objective } = await published(user.id);
      await prisma.objective.update({
        where: { id: objective.id },
        data: { publishedAt: daysAgo(8) },
      });
      const fresh = await createKeyResult(prisma, {
        objectiveId: objective.id,
        ownerId: user.id,
        position: 2,
      });
      await prisma.keyResult.update({
        where: { id: fresh.id },
        data: { lastCheckInAt: daysAgo(2) },
      });

      const res = await pending(auth);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        keyResultId: kr.id,
        objectiveId: objective.id,
        cadence: 'WEEKLY',
        lastCheckInAt: null,
      });
    });

    it('usa el último check-in como referencia y un check-in nuevo lo saca de la lista', async () => {
      const { user, auth } = await as('MEMBER');
      const { kr } = await published(user.id);
      await prisma.keyResult.update({ where: { id: kr.id }, data: { lastCheckInAt: daysAgo(8) } });
      expect((await pending(auth)).body).toHaveLength(1);
      await postCheckIn(auth, kr.id, valid).expect(201);
      expect((await pending(auth)).body).toHaveLength(0);
    });

    it('respeta la cadencia del ciclo (mensual: 8 días no vence, 31 sí)', async () => {
      const { user, auth } = await as('MEMBER');
      const cycle = await createCycle(prisma);
      await prisma.cycle.update({ where: { id: cycle.id }, data: { checkInCadence: 'MONTHLY' } });
      const { kr } = await published(user.id, { cycleId: cycle.id });
      await prisma.keyResult.update({ where: { id: kr.id }, data: { lastCheckInAt: daysAgo(8) } });
      expect((await pending(auth)).body).toHaveLength(0);
      await prisma.keyResult.update({ where: { id: kr.id }, data: { lastCheckInAt: daysAgo(31) } });
      const res = await pending(auth);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].cadence).toBe('MONTHLY');
    });

    it('nunca vence un objetivo CLOSED o DRAFT, ni aparecen KRs de otros', async () => {
      const { user, auth } = await as('MEMBER');
      const other = await as('MEMBER');
      const old = { lastCheckInAt: daysAgo(30) };
      const closed = await published(user.id, { status: 'CLOSED' });
      const draft = await published(user.id, { status: 'DRAFT' });
      const theirs = await published(other.user.id);
      for (const { kr } of [closed, draft, theirs]) {
        await prisma.keyResult.update({ where: { id: kr.id }, data: old });
      }
      expect((await pending(auth)).body).toHaveLength(0);
    });

    describe('objetivos de EQUIPO (decisión round 7)', () => {
      const ids = (body: { keyResultId: string }[]) => body.map((p) => p.keyResultId);
      /** Objetivo del equipo publicado hace 10 días con un KR cuyo responsable es `krOwnerId`. */
      const teamObjective = async (krOwnerId: string) => {
        const team = await createTeam(prisma);
        const cycle = await createCycle(prisma);
        const objective = await createObjective(prisma, {
          cycleId: cycle.id,
          createdById: krOwnerId,
          ownerTeamId: team.id,
        });
        await prisma.objective.update({
          where: { id: objective.id },
          data: { status: 'PUBLISHED', publishedAt: daysAgo(10) },
        });
        const kr = await createKeyResult(prisma, { objectiveId: objective.id, ownerId: krOwnerId });
        return { team, objective, kr };
      };
      const join = (teamId: string, userId: string, isLead = false) =>
        prisma.teamMember.create({ data: { teamId, userId, isLead } });

      it('el LÍDER del equipo ve el KR vencido aunque no sea su responsable', async () => {
        const owner = await as('MEMBER');
        const lead = await as('LEADER');
        const { team, kr } = await teamObjective(owner.user.id);
        await join(team.id, owner.user.id);
        await join(team.id, lead.user.id, true);

        expect(ids((await pending(lead.auth)).body)).toEqual([kr.id]);
      });

      it('el responsable del KR lo ve; otros miembros del equipo y líderes de otros equipos NO', async () => {
        const owner = await as('MEMBER');
        const peer = await as('MEMBER');
        const otherLead = await as('LEADER');
        const { team, kr } = await teamObjective(owner.user.id);
        const otherTeam = await createTeam(prisma, { parentId: team.id });
        await join(team.id, owner.user.id);
        await join(team.id, peer.user.id);
        await join(otherTeam.id, otherLead.user.id, true);

        expect(ids((await pending(owner.auth)).body)).toEqual([kr.id]);
        expect((await pending(peer.auth)).body).toHaveLength(0);
        expect((await pending(otherLead.auth)).body).toHaveLength(0);
      });

      it('líder que además es responsable del KR aparece UNA sola vez', async () => {
        const lead = await as('LEADER');
        const { team } = await teamObjective(lead.user.id);
        await join(team.id, lead.user.id, true);
        expect((await pending(lead.auth)).body).toHaveLength(1);
      });

      it('un KR vigente del equipo no aparece para el líder', async () => {
        const lead = await as('LEADER');
        const { team, kr } = await teamObjective(lead.user.id);
        await join(team.id, lead.user.id, true);
        await prisma.keyResult.update({
          where: { id: kr.id },
          data: { lastCheckInAt: daysAgo(1) },
        });
        expect((await pending(lead.auth)).body).toHaveLength(0);
      });
    });

    describe('KeyResultDto.overdue', () => {
      it('GET /objectives/:id expone overdue y lastCheckInAt calculados con la cadencia del ciclo', async () => {
        const { user, auth } = await as('MEMBER');
        const { objective, kr } = await published(user.id);
        await prisma.objective.update({
          where: { id: objective.id },
          data: { publishedAt: daysAgo(8) },
        });
        const fresh = await createKeyResult(prisma, {
          objectiveId: objective.id,
          ownerId: user.id,
          position: 2,
        });
        const last = daysAgo(2);
        await prisma.keyResult.update({ where: { id: fresh.id }, data: { lastCheckInAt: last } });

        const res = await http()
          .get(`/objectives/${objective.id}`)
          .set('Authorization', auth)
          .expect(200);
        const byId = Object.fromEntries(res.body.keyResults.map((k: { id: string }) => [k.id, k]));
        expect(byId[kr.id]).toMatchObject({ overdue: true, lastCheckInAt: null });
        expect(byId[fresh.id].overdue).toBe(false);
        expect(byId[fresh.id].lastCheckInAt).toBe(last.toISOString());
      });

      it('un objetivo CLOSED nunca marca overdue', async () => {
        const { user, auth } = await as('MEMBER');
        const { objective, kr } = await published(user.id, { status: 'CLOSED' });
        await prisma.keyResult.update({
          where: { id: kr.id },
          data: { lastCheckInAt: daysAgo(40) },
        });
        const res = await http()
          .get(`/objectives/${objective.id}`)
          .set('Authorization', auth)
          .expect(200);
        expect(res.body.keyResults[0].overdue).toBe(false);
      });
    });

    it('sin token -> 401', async () => {
      await http().get('/check-ins/pending').expect(401);
    });
  });
});
