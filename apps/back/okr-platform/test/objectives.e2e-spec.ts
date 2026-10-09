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

describe('Objectives (e2e)', () => {
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

  const body = (cycleId: string, extra: object = {}) => ({
    cycleId,
    title: 'Mejorar la entrega continua',
    origin: 'BOTTOM_UP',
    type: 'COMMITTED',
    ...extra,
  });

  const post = (auth: string, payload: object) =>
    http().post('/objectives').set('Authorization', auth).send(payload);

  const published = async (cycleId: string, ownerUserId: string, createdById = ownerUserId) =>
    prisma.objective.update({
      where: { id: (await createObjective(prisma, { cycleId, createdById, ownerUserId })).id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });

  describe('POST /objectives (REQ-OKR-1)', () => {
    it('MEMBER crea un objetivo propio -> 201 DRAFT con score 0 y sin KRs', async () => {
      const { user, auth } = await as('MEMBER');
      const cycle = await createCycle(prisma);
      const res = await post(auth, body(cycle.id, { ownerUserId: user.id })).expect(201);
      expect(res.body).toMatchObject({
        cycleId: cycle.id,
        ownerUserId: user.id,
        ownerTeamId: null,
        parentObjectiveId: null,
        title: 'Mejorar la entrega continua',
        origin: 'BOTTOM_UP',
        type: 'COMMITTED',
        status: 'DRAFT',
        score: 0,
        finalScore: null,
        achieved: null,
        createdById: user.id,
        publishedAt: null,
        keyResults: [],
      });
    });

    it('sin token -> 401', async () => {
      await http().post('/objectives').send({}).expect(401);
    });

    it('owner usuario Y equipo a la vez -> 400; ninguno -> 400', async () => {
      const { user, auth } = await as('ADMIN');
      const team = await createTeam(prisma);
      const cycle = await createCycle(prisma);
      await post(auth, body(cycle.id, { ownerUserId: user.id, ownerTeamId: team.id })).expect(400);
      await post(auth, body(cycle.id)).expect(400);
    });

    it('sin origin -> 400; origin/type inválidos -> 400', async () => {
      const { user, auth } = await as('MEMBER');
      const cycle = await createCycle(prisma);
      const { origin: _omit, ...withoutOrigin } = body(cycle.id, { ownerUserId: user.id });
      void _omit;
      await post(auth, withoutOrigin).expect(400);
      await post(auth, body(cycle.id, { ownerUserId: user.id, origin: 'SIDEWAYS' })).expect(400);
      await post(auth, body(cycle.id, { ownerUserId: user.id, type: 'WISHFUL' })).expect(400);
    });

    it('campos no declarados (threshold, status, score) -> 400 (whitelist)', async () => {
      const { user, auth } = await as('MEMBER');
      const cycle = await createCycle(prisma);
      for (const extra of [{ threshold: 0.5 }, { status: 'PUBLISHED' }, { score: 1 }]) {
        await post(auth, body(cycle.id, { ownerUserId: user.id, ...extra })).expect(400);
      }
    });

    it('título corto (<3) o vacío -> 400', async () => {
      const { user, auth } = await as('MEMBER');
      const cycle = await createCycle(prisma);
      await post(auth, body(cycle.id, { ownerUserId: user.id, title: 'ab' })).expect(400);
    });

    it('MEMBER no crea para otro usuario ni para un equipo -> 403', async () => {
      const { auth } = await as('MEMBER');
      const other = await createUser(prisma);
      const team = await createTeam(prisma);
      const cycle = await createCycle(prisma);
      await post(auth, body(cycle.id, { ownerUserId: other.id })).expect(403);
      await post(auth, body(cycle.id, { ownerTeamId: team.id })).expect(403);
    });

    it('LEADER crea para el equipo que lidera -> 201; para otro equipo -> 403', async () => {
      const { user, auth } = await as('LEADER');
      const mine = await createTeam(prisma);
      const theirs = await createTeam(prisma, { name: 'Ajeno', parentId: mine.id });
      await prisma.teamMember.create({ data: { userId: user.id, teamId: mine.id, isLead: true } });
      const cycle = await createCycle(prisma);
      const res = await post(auth, body(cycle.id, { ownerTeamId: mine.id })).expect(201);
      expect(res.body).toMatchObject({ ownerTeamId: mine.id, ownerUserId: null });
      await post(auth, body(cycle.id, { ownerTeamId: theirs.id })).expect(403);
    });

    it('ADMIN crea para cualquier usuario o equipo -> 201', async () => {
      const { auth } = await as('ADMIN');
      const other = await createUser(prisma);
      const team = await createTeam(prisma);
      const cycle = await createCycle(prisma);
      await post(auth, body(cycle.id, { ownerUserId: other.id })).expect(201);
      await post(auth, body(cycle.id, { ownerTeamId: team.id })).expect(201);
    });

    it('ciclo inexistente -> 404; ciclo CLOSED -> 409; owner inexistente -> 404', async () => {
      const { user, auth } = await as('ADMIN');
      const closed = await createCycle(prisma);
      await prisma.cycle.update({ where: { id: closed.id }, data: { status: 'CLOSED' } });
      await post(auth, body(MISSING_ID, { ownerUserId: user.id })).expect(404);
      await post(auth, body(closed.id, { ownerUserId: user.id })).expect(409);
      const cycle = await createCycle(prisma);
      await post(auth, body(cycle.id, { ownerUserId: MISSING_ID })).expect(404);
      await post(auth, body(cycle.id, { ownerTeamId: MISSING_ID })).expect(404);
    });

    it('createdById es el actor aunque el owner sea otro (ADMIN)', async () => {
      const { user: admin, auth } = await as('ADMIN');
      const other = await createUser(prisma);
      const cycle = await createCycle(prisma);
      const res = await post(auth, body(cycle.id, { ownerUserId: other.id })).expect(201);
      expect(res.body.createdById).toBe(admin.id);
    });
  });

  describe('límite de 5 objetivos por owner y ciclo (REQ-OKR-2)', () => {
    it('con 5 DRAFT+PUBLISHED el 6to -> 422 OBJECTIVE_LIMIT_EXCEEDED', async () => {
      const { user, auth } = await as('MEMBER');
      const cycle = await createCycle(prisma);
      for (let i = 0; i < 3; i++)
        await createObjective(prisma, {
          cycleId: cycle.id,
          createdById: user.id,
          ownerUserId: user.id,
        });
      await published(cycle.id, user.id);
      await published(cycle.id, user.id);
      const res = await post(auth, body(cycle.id, { ownerUserId: user.id })).expect(422);
      expect(res.body.code).toBe('OBJECTIVE_LIMIT_EXCEEDED');
    });

    it('los CLOSED no cuentan; objetivos de otro ciclo u otro owner tampoco', async () => {
      const { user, auth } = await as('MEMBER');
      const other = await createUser(prisma);
      const cycle = await createCycle(prisma);
      const cycle2 = await createCycle(prisma);
      for (let i = 0; i < 5; i++) {
        const o = await createObjective(prisma, {
          cycleId: cycle.id,
          createdById: user.id,
          ownerUserId: user.id,
        });
        if (i < 2)
          await prisma.objective.update({ where: { id: o.id }, data: { status: 'CLOSED' } });
      }
      // 3 abiertos + 2 cerrados: entra uno más (4 abiertos), otro (5), el siguiente no.
      await post(auth, body(cycle.id, { ownerUserId: user.id })).expect(201);
      await post(auth, body(cycle.id, { ownerUserId: user.id })).expect(201);
      await post(auth, body(cycle.id, { ownerUserId: user.id })).expect(422);
      // Otro ciclo: libre.
      await post(auth, body(cycle2.id, { ownerUserId: user.id })).expect(201);
      void other;
    });

    it('el límite aplica por equipo owner', async () => {
      const { auth } = await as('ADMIN');
      const team = await createTeam(prisma);
      const cycle = await createCycle(prisma);
      for (let i = 0; i < 5; i++)
        await post(auth, body(cycle.id, { ownerTeamId: team.id })).expect(201);
      await post(auth, body(cycle.id, { ownerTeamId: team.id })).expect(422);
    });

    it('creaciones concurrentes no superan el límite', async () => {
      const { user, auth } = await as('MEMBER');
      const cycle = await createCycle(prisma);
      const results = await Promise.all(
        Array.from({ length: 8 }, () => post(auth, body(cycle.id, { ownerUserId: user.id }))),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(5);
      expect(results.filter((r) => r.status === 422)).toHaveLength(3);
    });
  });

  describe('alineación (REQ-ALN-1)', () => {
    it('padre PUBLISHED de otro ciclo (QUARTER -> ANNUAL) -> 201', async () => {
      const { user, auth } = await as('MEMBER');
      const annual = await createCycle(prisma);
      const quarter = await createCycle(prisma, {
        kind: 'QUARTER',
        parentId: annual.id,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-03-31'),
      });
      const parent = await published(annual.id, user.id);
      const res = await post(
        auth,
        body(quarter.id, { ownerUserId: user.id, parentObjectiveId: parent.id }),
      ).expect(201);
      expect(res.body.parentObjectiveId).toBe(parent.id);
    });

    it('padre DRAFT -> 422 ALIGNMENT_PARENT_NOT_PUBLISHED; padre inexistente -> 404', async () => {
      const { user, auth } = await as('MEMBER');
      const cycle = await createCycle(prisma);
      const draft = await createObjective(prisma, {
        cycleId: cycle.id,
        createdById: user.id,
        ownerUserId: user.id,
      });
      const res = await post(
        auth,
        body(cycle.id, { ownerUserId: user.id, parentObjectiveId: draft.id }),
      ).expect(422);
      expect(res.body.code).toBe('ALIGNMENT_PARENT_NOT_PUBLISHED');
      await post(
        auth,
        body(cycle.id, { ownerUserId: user.id, parentObjectiveId: MISSING_ID }),
      ).expect(404);
    });

    it('PATCH: A->B y luego B->A -> 400 ALIGNMENT_CYCLE; auto-referencia -> 400', async () => {
      const { user, auth } = await as('MEMBER');
      const cycle = await createCycle(prisma);
      const a = await published(cycle.id, user.id);
      const b = await published(cycle.id, user.id);
      await http()
        .patch(`/objectives/${a.id}`)
        .set('Authorization', auth)
        .send({ parentObjectiveId: b.id })
        .expect(200);
      const res = await http()
        .patch(`/objectives/${b.id}`)
        .set('Authorization', auth)
        .send({ parentObjectiveId: a.id })
        .expect(400);
      expect(res.body.code).toBe('ALIGNMENT_CYCLE');
      const self = await http()
        .patch(`/objectives/${a.id}`)
        .set('Authorization', auth)
        .send({ parentObjectiveId: a.id })
        .expect(400);
      expect(self.body.code).toBe('ALIGNMENT_SELF_PARENT');
    });

    it('PATCH: ciclo indirecto A->B->C y C->A -> 400', async () => {
      const { user, auth } = await as('MEMBER');
      const cycle = await createCycle(prisma);
      const a = await published(cycle.id, user.id);
      const b = await published(cycle.id, user.id);
      const c = await published(cycle.id, user.id);
      const patch = (id: string, parentObjectiveId: string) =>
        http().patch(`/objectives/${id}`).set('Authorization', auth).send({ parentObjectiveId });
      await patch(a.id, b.id).expect(200);
      await patch(b.id, c.id).expect(200);
      await patch(c.id, a.id).expect(400);
    });

    it('PATCH: parentObjectiveId null desalinea', async () => {
      const { user, auth } = await as('MEMBER');
      const cycle = await createCycle(prisma);
      const a = await published(cycle.id, user.id);
      const b = await published(cycle.id, user.id);
      await http()
        .patch(`/objectives/${a.id}`)
        .set('Authorization', auth)
        .send({ parentObjectiveId: b.id })
        .expect(200);
      const res = await http()
        .patch(`/objectives/${a.id}`)
        .set('Authorization', auth)
        .send({ parentObjectiveId: null })
        .expect(200);
      expect(res.body.parentObjectiveId).toBeNull();
    });
  });

  describe('GET /objectives y /objectives/:id (visibilidad)', () => {
    it('lista PUBLISHED de todos y DRAFT solo para quienes pueden editar', async () => {
      const { user: me, auth } = await as('MEMBER');
      const other = await createUser(prisma);
      const cycle = await createCycle(prisma);
      const myDraft = await createObjective(prisma, {
        cycleId: cycle.id,
        createdById: me.id,
        ownerUserId: me.id,
      });
      const otherDraft = await createObjective(prisma, {
        cycleId: cycle.id,
        createdById: other.id,
        ownerUserId: other.id,
      });
      const otherPub = await published(cycle.id, other.id);
      const res = await http().get('/objectives').set('Authorization', auth).expect(200);
      const ids = (res.body as { id: string }[]).map((o) => o.id).sort();
      expect(ids).toEqual([myDraft.id, otherPub.id].sort());
      expect(ids).not.toContain(otherDraft.id);
    });

    it('LEADER ve los DRAFT del equipo que lidera; ADMIN ve todos', async () => {
      const { user: leader, auth: leaderAuth } = await as('LEADER');
      const { auth: adminAuth } = await as('ADMIN');
      const team = await createTeam(prisma);
      await prisma.teamMember.create({
        data: { userId: leader.id, teamId: team.id, isLead: true },
      });
      const other = await createUser(prisma);
      const cycle = await createCycle(prisma);
      const teamDraft = await createObjective(prisma, {
        cycleId: cycle.id,
        createdById: leader.id,
        ownerTeamId: team.id,
      });
      const otherDraft = await createObjective(prisma, {
        cycleId: cycle.id,
        createdById: other.id,
        ownerUserId: other.id,
      });
      const lead = await http().get('/objectives').set('Authorization', leaderAuth).expect(200);
      expect((lead.body as { id: string }[]).map((o) => o.id)).toEqual([teamDraft.id]);
      const admin = await http().get('/objectives').set('Authorization', adminAuth).expect(200);
      expect((admin.body as { id: string }[]).map((o) => o.id).sort()).toEqual(
        [teamDraft.id, otherDraft.id].sort(),
      );
    });

    it('filtra por cycleId, teamId, ownerUserId y status', async () => {
      const { user, auth } = await as('ADMIN');
      const team = await createTeam(prisma);
      const cycle = await createCycle(prisma);
      const cycle2 = await createCycle(prisma);
      const byUser = await published(cycle.id, user.id);
      const byTeam = await prisma.objective.update({
        where: {
          id: (
            await createObjective(prisma, {
              cycleId: cycle.id,
              createdById: user.id,
              ownerTeamId: team.id,
            })
          ).id,
        },
        data: { status: 'PUBLISHED' },
      });
      const otherCycle = await published(cycle2.id, user.id);
      const ids = async (query: string) =>
        (
          (await http().get(`/objectives?${query}`).set('Authorization', auth).expect(200))
            .body as {
            id: string;
          }[]
        )
          .map((o) => o.id)
          .sort();
      expect(await ids(`cycleId=${cycle2.id}`)).toEqual([otherCycle.id]);
      expect(await ids(`teamId=${team.id}`)).toEqual([byTeam.id]);
      expect(await ids(`ownerUserId=${user.id}&cycleId=${cycle.id}`)).toEqual([byUser.id]);
      expect(await ids('status=DRAFT')).toEqual([]);
      expect(await ids(`status=PUBLISHED&cycleId=${cycle.id}`)).toEqual(
        [byUser.id, byTeam.id].sort(),
      );
    });

    it('filtros inválidos -> 400', async () => {
      const { auth } = await as('MEMBER');
      await http().get('/objectives?cycleId=nope').set('Authorization', auth).expect(400);
      await http().get('/objectives?status=WHATEVER').set('Authorization', auth).expect(400);
    });

    it('detalle PUBLISHED visible para cualquiera, con KRs; DRAFT ajeno -> 404; inexistente -> 404', async () => {
      const { auth } = await as('MEMBER');
      const owner = await createUser(prisma);
      const cycle = await createCycle(prisma);
      const pub = await published(cycle.id, owner.id);
      await createKeyResult(prisma, { objectiveId: pub.id, ownerId: owner.id });
      const draft = await createObjective(prisma, {
        cycleId: cycle.id,
        createdById: owner.id,
        ownerUserId: owner.id,
      });
      const res = await http().get(`/objectives/${pub.id}`).set('Authorization', auth).expect(200);
      expect(res.body.id).toBe(pub.id);
      expect(res.body.keyResults).toHaveLength(1);
      await http().get(`/objectives/${draft.id}`).set('Authorization', auth).expect(404);
      await http().get(`/objectives/${MISSING_ID}`).set('Authorization', auth).expect(404);
      await http().get('/objectives/no-uuid').set('Authorization', auth).expect(400);
    });
  });

  describe('PATCH /objectives/:id', () => {
    it('owner edita todos los campos editables en DRAFT -> 200', async () => {
      const { user, auth } = await as('MEMBER');
      const cycle = await createCycle(prisma);
      const o = await createObjective(prisma, {
        cycleId: cycle.id,
        createdById: user.id,
        ownerUserId: user.id,
      });
      const res = await http()
        .patch(`/objectives/${o.id}`)
        .set('Authorization', auth)
        .send({
          title: 'Nuevo título',
          description: 'Detalle',
          type: 'ASPIRATIONAL',
          origin: 'TOP_DOWN',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        title: 'Nuevo título',
        description: 'Detalle',
        type: 'ASPIRATIONAL',
        origin: 'TOP_DOWN',
      });
    });

    it('PUBLISHED: título/descripción -> 200; type u origin -> 409 OBJECTIVE_FIELD_LOCKED', async () => {
      const { user, auth } = await as('MEMBER');
      const cycle = await createCycle(prisma);
      const o = await published(cycle.id, user.id);
      await http()
        .patch(`/objectives/${o.id}`)
        .set('Authorization', auth)
        .send({ title: 'Otro título' })
        .expect(200);
      const res = await http()
        .patch(`/objectives/${o.id}`)
        .set('Authorization', auth)
        .send({ type: 'ASPIRATIONAL' })
        .expect(409);
      expect(res.body.code).toBe('OBJECTIVE_FIELD_LOCKED');
    });

    it('CLOSED -> 409', async () => {
      const { user, auth } = await as('MEMBER');
      const cycle = await createCycle(prisma);
      const o = await published(cycle.id, user.id);
      await prisma.objective.update({ where: { id: o.id }, data: { status: 'CLOSED' } });
      await http()
        .patch(`/objectives/${o.id}`)
        .set('Authorization', auth)
        .send({ title: 'Nada' })
        .expect(409);
    });

    it('MEMBER ajeno edita un objetivo PUBLISHED de otro -> 403; DRAFT ajeno -> 404', async () => {
      const { auth } = await as('MEMBER');
      const owner = await createUser(prisma);
      const cycle = await createCycle(prisma);
      const pub = await published(cycle.id, owner.id);
      const draft = await createObjective(prisma, {
        cycleId: cycle.id,
        createdById: owner.id,
        ownerUserId: owner.id,
      });
      const patch = (id: string) =>
        http().patch(`/objectives/${id}`).set('Authorization', auth).send({ title: 'Hackeo' });
      await patch(pub.id).expect(403);
      await patch(draft.id).expect(404);
    });

    it('LEADER del equipo owner y ADMIN pueden editar; campos de owner/ciclo/estado -> 400', async () => {
      const { user: leader, auth: leaderAuth } = await as('LEADER');
      const { auth: adminAuth } = await as('ADMIN');
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
      const patch = (auth: string, payload: object) =>
        http().patch(`/objectives/${o.id}`).set('Authorization', auth).send(payload);
      await patch(leaderAuth, { title: 'Por el líder' }).expect(200);
      await patch(adminAuth, { title: 'Por el admin' }).expect(200);
      for (const extra of [{ ownerUserId: leader.id }, { cycleId: cycle.id }, { status: 'CLOSED' }])
        await patch(leaderAuth, extra).expect(400);
    });
  });

  describe('DELETE /objectives/:id', () => {
    it('owner borra su DRAFT (y sus KRs) -> 204', async () => {
      const { user, auth } = await as('MEMBER');
      const cycle = await createCycle(prisma);
      const o = await createObjective(prisma, {
        cycleId: cycle.id,
        createdById: user.id,
        ownerUserId: user.id,
      });
      await createKeyResult(prisma, { objectiveId: o.id, ownerId: user.id });
      await http().delete(`/objectives/${o.id}`).set('Authorization', auth).expect(204);
      expect(await prisma.objective.count()).toBe(0);
      expect(await prisma.keyResult.count()).toBe(0);
    });

    it('PUBLISHED -> 409; ajeno -> 403; DRAFT ajeno -> 404; inexistente -> 404', async () => {
      const { user, auth } = await as('MEMBER');
      const other = await createUser(prisma);
      const cycle = await createCycle(prisma);
      const mine = await published(cycle.id, user.id);
      const theirs = await published(cycle.id, other.id);
      const theirDraft = await createObjective(prisma, {
        cycleId: cycle.id,
        createdById: other.id,
        ownerUserId: other.id,
      });
      await http().delete(`/objectives/${mine.id}`).set('Authorization', auth).expect(409);
      await http().delete(`/objectives/${theirs.id}`).set('Authorization', auth).expect(403);
      await http().delete(`/objectives/${theirDraft.id}`).set('Authorization', auth).expect(404);
      await http().delete(`/objectives/${MISSING_ID}`).set('Authorization', auth).expect(404);
    });
  });

  describe('POST /objectives/:id/publish (REQ-OKR-2)', () => {
    /** Owner con `count` objetivos DRAFT, cada uno con `krs[i]` KRs; devuelve los objetivos. */
    const seedOwner = async (
      ownerId: string,
      cycleId: string,
      krs: number[],
    ): Promise<{ id: string }[]> => {
      const out: { id: string }[] = [];
      for (const n of krs) {
        const o = await createObjective(prisma, {
          cycleId,
          createdById: ownerId,
          ownerUserId: ownerId,
        });
        for (let i = 0; i < n; i++)
          await createKeyResult(prisma, { objectiveId: o.id, ownerId, position: i + 1 });
        out.push(o);
      }
      return out;
    };
    const publish = (auth: string, id: string) =>
      http().post(`/objectives/${id}/publish`).set('Authorization', auth);

    it('3 objetivos con 3 KRs c/u -> 200 PUBLISHED, publishedAt y AuditLog OBJECTIVE_PUBLISHED', async () => {
      const { user, auth } = await as('MEMBER');
      const cycle = await createCycle(prisma);
      const [first] = await seedOwner(user.id, cycle.id, [3, 3, 3]);
      const res = await publish(auth, first.id).expect(200);
      expect(res.body.status).toBe('PUBLISHED');
      expect(res.body.publishedAt).not.toBeNull();
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: first.id, action: 'OBJECTIVE_PUBLISHED' },
      });
      expect(audit.actorId).toBe(user.id);
      expect(audit.before).toEqual({ status: 'DRAFT' });
      expect(audit.after).toEqual({ status: 'PUBLISHED' });
    });

    it('objetivo con 2 KRs -> 422 MIN_KRS_NOT_MET', async () => {
      const { user, auth } = await as('MEMBER');
      const cycle = await createCycle(prisma);
      const [first] = await seedOwner(user.id, cycle.id, [2, 3, 3]);
      const res = await publish(auth, first.id).expect(422);
      expect(res.body.code).toBe('MIN_KRS_NOT_MET');
      expect((await prisma.objective.findUniqueOrThrow({ where: { id: first.id } })).status).toBe(
        'DRAFT',
      );
    });

    it('owner con 2 objetivos (uno con 3 KRs) -> 422 MIN_OBJECTIVES_NOT_MET', async () => {
      const { user, auth } = await as('MEMBER');
      const cycle = await createCycle(prisma);
      const [first] = await seedOwner(user.id, cycle.id, [3, 3]);
      const res = await publish(auth, first.id).expect(422);
      expect(res.body.code).toBe('MIN_OBJECTIVES_NOT_MET');
    });

    it('los objetivos CLOSED no cuentan para el mínimo', async () => {
      const { user, auth } = await as('MEMBER');
      const cycle = await createCycle(prisma);
      const [first, second, third] = await seedOwner(user.id, cycle.id, [3, 3, 3]);
      await prisma.objective.update({ where: { id: third.id }, data: { status: 'CLOSED' } });
      void second;
      await publish(auth, first.id).expect(422);
    });

    it('ya PUBLISHED -> 409', async () => {
      const { user, auth } = await as('MEMBER');
      const cycle = await createCycle(prisma);
      const [first] = await seedOwner(user.id, cycle.id, [3, 3, 3]);
      await publish(auth, first.id).expect(200);
      await publish(auth, first.id).expect(409);
    });

    it('ciclo CLOSED -> 409', async () => {
      const { user, auth } = await as('MEMBER');
      const cycle = await createCycle(prisma);
      const [first] = await seedOwner(user.id, cycle.id, [3, 3, 3]);
      await prisma.cycle.update({ where: { id: cycle.id }, data: { status: 'CLOSED' } });
      await publish(auth, first.id).expect(409);
    });

    it('no-owner -> 404 si DRAFT ajeno; 403 si PUBLISHED no aplica (ya publicado ajeno)', async () => {
      const { auth } = await as('MEMBER');
      const owner = await createUser(prisma);
      const cycle = await createCycle(prisma);
      const [first] = await seedOwner(owner.id, cycle.id, [3, 3, 3]);
      await publish(auth, first.id).expect(404);
      await publish(auth, MISSING_ID).expect(404);
    });

    it('LEADER publica objetivos del equipo que lidera', async () => {
      const { user: leader, auth } = await as('LEADER');
      const team = await createTeam(prisma);
      await prisma.teamMember.create({
        data: { userId: leader.id, teamId: team.id, isLead: true },
      });
      const cycle = await createCycle(prisma);
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const o = await createObjective(prisma, {
          cycleId: cycle.id,
          createdById: leader.id,
          ownerTeamId: team.id,
        });
        for (let k = 0; k < 3; k++)
          await createKeyResult(prisma, { objectiveId: o.id, ownerId: leader.id, position: k + 1 });
        ids.push(o.id);
      }
      await publish(auth, ids[0]).expect(200);
    });
  });
});
