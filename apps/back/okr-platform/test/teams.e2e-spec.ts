import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { bearer } from './helpers/auth';
import { truncateAll } from './helpers/db';
import { createCycle, createObjective, createTeam, createUser } from './helpers/factories';

const MISSING_ID = '6f1c2f0e-3b8d-4a52-9c5e-1d2a3b4c5d6e';

describe('Teams (e2e)', () => {
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

  describe('POST /teams (REQ-TEAM-1)', () => {
    it('ADMIN crea la raíz y un hijo con padre válido -> 201', async () => {
      const { auth } = await as('ADMIN');
      const root = await http()
        .post('/teams')
        .set('Authorization', auth)
        .send({ name: 'Organización' })
        .expect(201);
      expect(root.body).toMatchObject({ name: 'Organización', parentId: null });

      const child = await http()
        .post('/teams')
        .set('Authorization', auth)
        .send({ name: 'Plataforma', parentId: root.body.id })
        .expect(201);
      expect(child.body).toMatchObject({ name: 'Plataforma', parentId: root.body.id });
    });

    it('LEADER -> 403 y MEMBER -> 403; sin token -> 401', async () => {
      const leader = await as('LEADER');
      const member = await as('MEMBER');
      await http().post('/teams').set('Authorization', leader.auth).send({ name: 'X' }).expect(403);
      await http().post('/teams').set('Authorization', member.auth).send({ name: 'X' }).expect(403);
      await http().post('/teams').send({ name: 'X' }).expect(401);
    });

    it('una segunda raíz -> 409 (raíz única = la organización)', async () => {
      const { auth } = await as('ADMIN');
      await createTeam(prisma, { name: 'Organización' });
      await http()
        .post('/teams')
        .set('Authorization', auth)
        .send({ name: 'Otra raíz' })
        .expect(409);
    });

    it('nombre repetido bajo el mismo padre -> 409', async () => {
      const { auth } = await as('ADMIN');
      const root = await createTeam(prisma, { name: 'Org' });
      const body = { name: 'Plataforma', parentId: root.id };
      await http().post('/teams').set('Authorization', auth).send(body).expect(201);
      await http().post('/teams').set('Authorization', auth).send(body).expect(409);
    });

    it('padre inexistente -> 404; body inválido o con campos extra -> 400', async () => {
      const { auth } = await as('ADMIN');
      const post = (body: object) => http().post('/teams').set('Authorization', auth).send(body);
      await post({ name: 'X', parentId: MISSING_ID }).expect(404);
      await post({ name: '' }).expect(400);
      await post({ name: 'X', parentId: 'no-uuid' }).expect(400);
      await post({ name: 'X', leaderId: MISSING_ID }).expect(400);
    });
  });

  describe('GET /teams', () => {
    it('devuelve el árbol anidado a cualquier autenticado; sin token -> 401', async () => {
      const { auth } = await as('MEMBER');
      const org = await createTeam(prisma, { name: 'Org' });
      const a = await createTeam(prisma, { name: 'A', parentId: org.id });
      await createTeam(prisma, { name: 'B', parentId: a.id });
      await createTeam(prisma, { name: 'C', parentId: org.id });

      const res = await http().get('/teams').set('Authorization', auth).expect(200);
      expect(res.body).toHaveLength(1);
      const [root] = res.body as {
        name: string;
        children: { name: string; children: { name: string }[] }[];
      }[];
      expect(root.name).toBe('Org');
      expect(root.children.map((c) => c.name)).toEqual(['A', 'C']);
      expect(root.children[0].children.map((c) => c.name)).toEqual(['B']);
      expect(root.children[1].children).toEqual([]);
      await http().get('/teams').expect(401);
    });
  });

  describe('GET /teams/:id', () => {
    it('incluye miembros (nombre e isLead) y originMix nulo sin cycleId', async () => {
      const { auth } = await as('MEMBER');
      const team = await createTeam(prisma, { name: 'Org' });
      const lead = await createUser(prisma, { name: 'Lía Líder' });
      const member = await createUser(prisma, { name: 'Mario Miembro' });
      await prisma.teamMember.create({ data: { userId: lead.id, teamId: team.id, isLead: true } });
      await prisma.teamMember.create({ data: { userId: member.id, teamId: team.id } });

      const res = await http().get(`/teams/${team.id}`).set('Authorization', auth).expect(200);
      expect(res.body).toMatchObject({ id: team.id, name: 'Org', parentId: null, originMix: null });
      expect(res.body.members).toEqual([
        { userId: lead.id, name: 'Lía Líder', isLead: true },
        { userId: member.id, name: 'Mario Miembro', isLead: false },
      ]);
    });

    it('con cycleId calcula originMix 50/50: 3 de 10 BOTTOM_UP -> warning (REQ-ALN-2)', async () => {
      const { auth, user } = await as('MEMBER');
      const team = await createTeam(prisma);
      const cycle = await createCycle(prisma);
      for (let i = 0; i < 10; i++) {
        await createObjective(prisma, {
          cycleId: cycle.id,
          createdById: user.id,
          ownerTeamId: team.id,
          origin: i < 3 ? 'BOTTOM_UP' : 'TOP_DOWN',
        });
      }
      const res = await http()
        .get(`/teams/${team.id}?cycleId=${cycle.id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(res.body.originMix).toEqual({
        topDown: 7,
        bottomUp: 3,
        bottomUpRatio: 0.3,
        warning: true,
      });
    });

    it('4 de 10 BOTTOM_UP (borde inclusivo) -> sin warning; objetivos de otros equipos/ciclos no cuentan', async () => {
      const { auth, user } = await as('MEMBER');
      const team = await createTeam(prisma);
      const other = await createTeam(prisma, { name: 'Otro', parentId: team.id });
      const cycle = await createCycle(prisma);
      const cycle2 = await createCycle(prisma);
      for (let i = 0; i < 10; i++) {
        await createObjective(prisma, {
          cycleId: cycle.id,
          createdById: user.id,
          ownerTeamId: team.id,
          origin: i < 4 ? 'BOTTOM_UP' : 'TOP_DOWN',
        });
      }
      await createObjective(prisma, {
        cycleId: cycle.id,
        createdById: user.id,
        ownerTeamId: other.id,
        origin: 'BOTTOM_UP',
      });
      await createObjective(prisma, {
        cycleId: cycle2.id,
        createdById: user.id,
        ownerTeamId: team.id,
        origin: 'BOTTOM_UP',
      });
      const res = await http()
        .get(`/teams/${team.id}?cycleId=${cycle.id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(res.body.originMix).toMatchObject({ topDown: 6, bottomUp: 4, warning: false });
    });

    it('equipo sin objetivos: porcentaje nulo y sin warning', async () => {
      const { auth } = await as('MEMBER');
      const team = await createTeam(prisma);
      const cycle = await createCycle(prisma);
      const res = await http()
        .get(`/teams/${team.id}?cycleId=${cycle.id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(res.body.originMix).toEqual({
        topDown: 0,
        bottomUp: 0,
        bottomUpRatio: null,
        warning: false,
      });
    });

    describe('originMix incluye objetivos individuales de los miembros (decisión ronda 5)', () => {
      const addMember = (userId: string, teamId: string) =>
        prisma.teamMember.create({ data: { userId, teamId } });

      it('cuenta objetivos propios del equipo MÁS los individuales de sus miembros en el ciclo', async () => {
        const { auth, user } = await as('MEMBER');
        const team = await createTeam(prisma);
        const cycle = await createCycle(prisma);
        const ana = await createUser(prisma);
        const beto = await createUser(prisma);
        await addMember(ana.id, team.id);
        await addMember(beto.id, team.id);
        const base = { cycleId: cycle.id, createdById: user.id };
        await createObjective(prisma, { ...base, ownerTeamId: team.id, origin: 'TOP_DOWN' });
        await createObjective(prisma, { ...base, ownerUserId: ana.id, origin: 'BOTTOM_UP' });
        await createObjective(prisma, { ...base, ownerUserId: ana.id, origin: 'BOTTOM_UP' });
        await createObjective(prisma, { ...base, ownerUserId: beto.id, origin: 'TOP_DOWN' });

        const res = await http()
          .get(`/teams/${team.id}?cycleId=${cycle.id}`)
          .set('Authorization', auth)
          .expect(200);
        expect(res.body.originMix).toEqual({
          topDown: 2,
          bottomUp: 2,
          bottomUpRatio: 0.5,
          warning: false,
        });
      });

      it('un objetivo individual de un miembro BOTTOM_UP evita el falso warning del equipo', async () => {
        const { auth, user } = await as('MEMBER');
        const team = await createTeam(prisma);
        const cycle = await createCycle(prisma);
        const ana = await createUser(prisma);
        await addMember(ana.id, team.id);
        // Solo con el objetivo del equipo (100% TOP_DOWN) habría warning; con el individual, 50%.
        await createObjective(prisma, {
          cycleId: cycle.id,
          createdById: user.id,
          ownerTeamId: team.id,
          origin: 'TOP_DOWN',
        });
        await createObjective(prisma, {
          cycleId: cycle.id,
          createdById: user.id,
          ownerUserId: ana.id,
          origin: 'BOTTOM_UP',
        });
        const res = await http()
          .get(`/teams/${team.id}?cycleId=${cycle.id}`)
          .set('Authorization', auth)
          .expect(200);
        expect(res.body.originMix).toMatchObject({ topDown: 1, bottomUp: 1, warning: false });
      });

      it('no cuenta individuales de no miembros, de otro ciclo, ni de miembros solo de subequipos', async () => {
        const { auth, user } = await as('MEMBER');
        const team = await createTeam(prisma);
        const child = await createTeam(prisma, { name: 'Hijo', parentId: team.id });
        const cycle = await createCycle(prisma);
        const cycle2 = await createCycle(prisma);
        const ana = await createUser(prisma);
        const outsider = await createUser(prisma);
        const childOnly = await createUser(prisma);
        await addMember(ana.id, team.id);
        await addMember(childOnly.id, child.id);
        const base = { createdById: user.id, origin: 'BOTTOM_UP' as const };
        await createObjective(prisma, { ...base, cycleId: cycle.id, ownerUserId: ana.id });
        await createObjective(prisma, { ...base, cycleId: cycle2.id, ownerUserId: ana.id });
        await createObjective(prisma, { ...base, cycleId: cycle.id, ownerUserId: outsider.id });
        await createObjective(prisma, { ...base, cycleId: cycle.id, ownerUserId: childOnly.id });
        const res = await http()
          .get(`/teams/${team.id}?cycleId=${cycle.id}`)
          .set('Authorization', auth)
          .expect(200);
        expect(res.body.originMix).toMatchObject({ topDown: 0, bottomUp: 1 });
      });

      it('un usuario en varios equipos del árbol cuenta una sola vez por equipo consultado', async () => {
        const { auth, user } = await as('MEMBER');
        const parent = await createTeam(prisma);
        const child = await createTeam(prisma, { name: 'Hijo', parentId: parent.id });
        const cycle = await createCycle(prisma);
        const ana = await createUser(prisma);
        await addMember(ana.id, parent.id);
        await addMember(ana.id, child.id);
        await createObjective(prisma, {
          cycleId: cycle.id,
          createdById: user.id,
          ownerUserId: ana.id,
          origin: 'BOTTOM_UP',
        });
        for (const team of [parent, child]) {
          const res = await http()
            .get(`/teams/${team.id}?cycleId=${cycle.id}`)
            .set('Authorization', auth)
            .expect(200);
          expect(res.body.originMix).toMatchObject({ topDown: 0, bottomUp: 1 });
        }
      });
    });

    it('equipo o ciclo inexistente -> 404; ids inválidos -> 400', async () => {
      const { auth } = await as('MEMBER');
      const team = await createTeam(prisma);
      await http().get(`/teams/${MISSING_ID}`).set('Authorization', auth).expect(404);
      await http()
        .get(`/teams/${team.id}?cycleId=${MISSING_ID}`)
        .set('Authorization', auth)
        .expect(404);
      await http().get('/teams/no-uuid').set('Authorization', auth).expect(400);
      await http().get(`/teams/${team.id}?cycleId=no-uuid`).set('Authorization', auth).expect(400);
    });
  });

  describe('PATCH /teams/:id', () => {
    it('ADMIN renombra y mueve a otra rama -> 200', async () => {
      const { auth } = await as('ADMIN');
      const org = await createTeam(prisma, { name: 'Org' });
      const a = await createTeam(prisma, { name: 'A', parentId: org.id });
      const d = await createTeam(prisma, { name: 'D', parentId: org.id });
      const res = await http()
        .patch(`/teams/${a.id}`)
        .set('Authorization', auth)
        .send({ name: 'A2', parentId: d.id })
        .expect(200);
      expect(res.body).toMatchObject({ id: a.id, name: 'A2', parentId: d.id });
    });

    it('mover A bajo su hijo B (ciclo) -> 409; bajo sí mismo -> 409; árbol intacto', async () => {
      const { auth } = await as('ADMIN');
      const org = await createTeam(prisma, { name: 'Org' });
      const a = await createTeam(prisma, { name: 'A', parentId: org.id });
      const b = await createTeam(prisma, { name: 'B', parentId: a.id });
      const patch = (id: string, body: object) =>
        http().patch(`/teams/${id}`).set('Authorization', auth).send(body);
      await patch(a.id, { parentId: b.id }).expect(409);
      await patch(a.id, { parentId: a.id }).expect(409);
      await patch(org.id, { parentId: b.id }).expect(409);
      expect((await prisma.team.findUniqueOrThrow({ where: { id: a.id } })).parentId).toBe(org.id);
    });

    it('LEADER -> 403; inexistente -> 404; padre inexistente -> 404; campos extra -> 400', async () => {
      const leader = await as('LEADER');
      const { auth } = await as('ADMIN');
      const org = await createTeam(prisma, { name: 'Org' });
      const a = await createTeam(prisma, { name: 'A', parentId: org.id });
      await http()
        .patch(`/teams/${a.id}`)
        .set('Authorization', leader.auth)
        .send({ name: 'X' })
        .expect(403);
      await http()
        .patch(`/teams/${MISSING_ID}`)
        .set('Authorization', auth)
        .send({ name: 'X' })
        .expect(404);
      await http()
        .patch(`/teams/${a.id}`)
        .set('Authorization', auth)
        .send({ parentId: MISSING_ID })
        .expect(404);
      await http().patch(`/teams/${a.id}`).set('Authorization', auth).send({ foo: 1 }).expect(400);
    });
  });

  describe('PUT/DELETE /teams/:id/members/:userId', () => {
    it('ADMIN agrega miembro, cambia isLead (upsert) y lo quita', async () => {
      const { auth } = await as('ADMIN');
      const team = await createTeam(prisma);
      const user = await createUser(prisma, { name: 'Pepe' });
      const url = `/teams/${team.id}/members/${user.id}`;

      const added = await http().put(url).set('Authorization', auth).send({}).expect(200);
      expect(added.body).toEqual({ userId: user.id, name: 'Pepe', isLead: false });

      const lead = await http()
        .put(url)
        .set('Authorization', auth)
        .send({ isLead: true })
        .expect(200);
      expect(lead.body.isLead).toBe(true);
      expect(await prisma.teamMember.count({ where: { teamId: team.id } })).toBe(1);

      await http().delete(url).set('Authorization', auth).expect(204);
      expect(await prisma.teamMember.count()).toBe(0);
      await http().delete(url).set('Authorization', auth).expect(404);
    });

    it('un usuario puede pertenecer a varios equipos', async () => {
      const { auth } = await as('ADMIN');
      const t1 = await createTeam(prisma, { name: 'T1' });
      const user = await createUser(prisma);
      const t2 = await createTeam(prisma, { name: 'T2', parentId: t1.id });
      await http()
        .put(`/teams/${t1.id}/members/${user.id}`)
        .set('Authorization', auth)
        .send({})
        .expect(200);
      await http()
        .put(`/teams/${t2.id}/members/${user.id}`)
        .set('Authorization', auth)
        .send({})
        .expect(200);
      expect(await prisma.teamMember.count({ where: { userId: user.id } })).toBe(2);
    });

    it('LEADER/MEMBER -> 403; equipo o usuario inexistente -> 404; isLead no booleano -> 400', async () => {
      const leader = await as('LEADER');
      const { auth } = await as('ADMIN');
      const team = await createTeam(prisma);
      const user = await createUser(prisma);
      await http()
        .put(`/teams/${team.id}/members/${user.id}`)
        .set('Authorization', leader.auth)
        .send({})
        .expect(403);
      await http()
        .delete(`/teams/${team.id}/members/${user.id}`)
        .set('Authorization', leader.auth)
        .expect(403);
      await http()
        .put(`/teams/${MISSING_ID}/members/${user.id}`)
        .set('Authorization', auth)
        .send({})
        .expect(404);
      await http()
        .put(`/teams/${team.id}/members/${MISSING_ID}`)
        .set('Authorization', auth)
        .send({})
        .expect(404);
      await http()
        .put(`/teams/${team.id}/members/${user.id}`)
        .set('Authorization', auth)
        .send({ isLead: 'si' })
        .expect(400);
    });
  });
});
