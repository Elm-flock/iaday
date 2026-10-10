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

describe('Reporte de equipo (e2e) REQ-PDF-1', () => {
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

  const as = async (
    role: 'ADMIN' | 'LEADER' | 'MEMBER' = 'MEMBER',
    overrides: { name?: string } = {},
  ) => {
    const user = await createUser(prisma, { role, ...overrides });
    return { user, auth: await bearer(app, user) };
  };
  const report = (auth: string, teamId: string, cycleId?: string) =>
    http()
      .get(`/reports/teams/${teamId}${cycleId ? `?cycleId=${cycleId}` : ''}`)
      .set('Authorization', auth);

  /** Objetivo con un KR 0 -> 100 con score `krScore`. */
  const objective = async (
    cycleId: string,
    owner: { userId?: string; teamId?: string },
    opts: {
      status?: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
      origin?: 'TOP_DOWN' | 'BOTTOM_UP';
      krScore?: number;
      title?: string;
    } = {},
  ) => {
    const createdById = owner.userId ?? (await createUser(prisma)).id;
    const o = await createObjective(prisma, {
      cycleId,
      createdById,
      ownerUserId: owner.userId ?? null,
      ownerTeamId: owner.teamId ?? null,
      origin: opts.origin ?? 'TOP_DOWN',
      ...(opts.title ? { title: opts.title } : {}),
    });
    const status = opts.status ?? 'PUBLISHED';
    await prisma.objective.update({
      where: { id: o.id },
      data: {
        status,
        score: opts.krScore ?? 0,
        publishedAt: status === 'DRAFT' ? null : new Date(),
        ...(status === 'CLOSED'
          ? {
              closedAt: new Date(),
              finalScore: opts.krScore ?? 0,
              achieved: (opts.krScore ?? 0) >= 1,
            }
          : {}),
      },
    });
    const kr = await createKeyResult(prisma, {
      objectiveId: o.id,
      ownerId: owner.userId ?? createdById,
    });
    await prisma.keyResult.update({
      where: { id: kr.id },
      data: { score: opts.krScore ?? 0, currentValue: (opts.krScore ?? 0) * 100 },
    });
    return { o, kr };
  };

  /** Raíz + equipo con un líder y dos miembros directos. */
  const setup = async () => {
    const team = await createTeam(prisma);
    const cycle = await createCycle(prisma);
    const ana = await as('LEADER', { name: 'Ana' });
    const zeta = await as('MEMBER', { name: 'Zeta' });
    await prisma.teamMember.create({
      data: { teamId: team.id, userId: ana.user.id, isLead: true },
    });
    await prisma.teamMember.create({ data: { teamId: team.id, userId: zeta.user.id } });
    return { team, cycle, ana, zeta };
  };

  it('devuelve equipo, ciclo y objetivos del equipo con KRs, score y banda', async () => {
    const { team, cycle, ana } = await setup();
    const { o, kr } = await objective(
      cycle.id,
      { teamId: team.id },
      { krScore: 0.7, title: 'Crecer' },
    );

    const res = await report(ana.auth, team.id, cycle.id).expect(200);
    expect(res.body.team).toEqual({ id: team.id, name: team.name });
    expect(res.body.cycle).toMatchObject({
      id: cycle.id,
      name: cycle.name,
      kind: 'ANNUAL',
      status: 'DRAFT',
      committedThreshold: 1,
      aspirationalThreshold: 0.7,
    });
    expect(typeof res.body.generatedAt).toBe('string');
    expect(res.body.teamObjectives).toHaveLength(1);
    expect(res.body.teamObjectives[0]).toMatchObject({
      id: o.id,
      title: 'Crecer',
      type: 'COMMITTED',
      origin: 'TOP_DOWN',
      status: 'PUBLISHED',
      score: 0.7,
      band: 'GREEN',
      finalScore: null,
      achieved: null,
    });
    expect(res.body.teamObjectives[0].keyResults[0]).toMatchObject({
      id: kr.id,
      scoring: 'DERIVED',
      startValue: '0',
      targetValue: '100',
      score: 0.7,
      band: 'GREEN',
      lastCheckInAt: null,
    });
  });

  it('los individuales de los miembros van AGRUPADOS por persona; objetivos ajenos, DRAFT y de otros ciclos no entran', async () => {
    const { team, cycle, ana, zeta } = await setup();
    const outsider = await as('MEMBER');
    const otherCycle = await createCycle(prisma);
    await objective(cycle.id, { userId: ana.user.id }, { title: 'Ana 1' });
    await objective(cycle.id, { userId: ana.user.id }, { title: 'Ana 2', krScore: 0.5 });
    await objective(cycle.id, { userId: zeta.user.id }, { title: 'Zeta 1', krScore: 0.9 });
    await objective(
      cycle.id,
      { userId: zeta.user.id },
      { title: 'Zeta borrador', status: 'DRAFT' },
    );
    await objective(cycle.id, { userId: outsider.user.id }, { title: 'Ajeno' });
    await objective(otherCycle.id, { userId: ana.user.id }, { title: 'Otro ciclo' });

    const res = await report(ana.auth, team.id, cycle.id).expect(200);
    expect(res.body.teamObjectives).toEqual([]);
    expect(res.body.members).toHaveLength(2);
    const byName = Object.fromEntries(
      res.body.members.map((m: { name: string; objectives: { title: string }[] }) => [
        m.name,
        m.objectives.map((o) => o.title).sort(),
      ]),
    );
    expect(byName).toEqual({ Ana: ['Ana 1', 'Ana 2'], Zeta: ['Zeta 1'] });
    expect(res.body.members[0]).toMatchObject({ userId: ana.user.id, name: 'Ana' });
  });

  it('SIN ranking: los miembros salen por nombre aunque el de mejor score tenga el último', async () => {
    const { team, cycle, ana, zeta } = await setup();
    await objective(cycle.id, { userId: ana.user.id }, { krScore: 0.1 });
    await objective(cycle.id, { userId: zeta.user.id }, { krScore: 1 });
    const res = await report(ana.auth, team.id, cycle.id).expect(200);
    expect(res.body.members.map((m: { name: string }) => m.name)).toEqual(['Ana', 'Zeta']);

    // Y al revés: si el de mejor score se llama distinto, el orden sigue siendo el alfabético.
    await prisma.user.update({ where: { id: zeta.user.id }, data: { name: 'Aaron' } });
    const again = await report(ana.auth, team.id, cycle.id).expect(200);
    expect(again.body.members.map((m: { name: string }) => m.name)).toEqual(['Aaron', 'Ana']);
  });

  it('incluye un miembro sin objetivos con lista vacía', async () => {
    const { team, cycle, ana } = await setup();
    const res = await report(ana.auth, team.id, cycle.id).expect(200);
    expect(res.body.members.map((m: { objectives: unknown[] }) => m.objectives)).toEqual([[], []]);
  });

  it('objetivos CLOSED traen logro al cierre (finalScore y achieved)', async () => {
    const { team, cycle, ana } = await setup();
    await objective(cycle.id, { teamId: team.id }, { status: 'CLOSED', krScore: 1 });
    await objective(cycle.id, { userId: ana.user.id }, { status: 'CLOSED', krScore: 0.5 });
    const res = await report(ana.auth, team.id, cycle.id).expect(200);
    expect(res.body.teamObjectives[0]).toMatchObject({
      status: 'CLOSED',
      finalScore: 1,
      achieved: true,
    });
    const anaObjective = res.body.members.find((m: { name: string }) => m.name === 'Ana')
      .objectives[0];
    expect(anaObjective).toMatchObject({ status: 'CLOSED', finalScore: 0.5, achieved: false });
  });

  it('mezcla de origen (50/50) sobre los objetivos del reporte: equipo + individuales de miembros', async () => {
    const { team, cycle, ana, zeta } = await setup();
    await objective(cycle.id, { teamId: team.id }, { origin: 'TOP_DOWN' });
    await objective(cycle.id, { userId: ana.user.id }, { origin: 'BOTTOM_UP' });
    await objective(cycle.id, { userId: zeta.user.id }, { origin: 'BOTTOM_UP' });
    await objective(cycle.id, { userId: zeta.user.id }, { origin: 'BOTTOM_UP', status: 'DRAFT' });
    const res = await report(ana.auth, team.id, cycle.id).expect(200);
    expect(res.body.originMix).toEqual({
      topDown: 1,
      bottomUp: 2,
      bottomUpRatio: 2 / 3,
      warning: true,
    });
  });

  describe('autorización: solo ADMIN o líder de ESE equipo', () => {
    it('ADMIN y líder del equipo -> 200', async () => {
      const { team, cycle, ana } = await setup();
      const admin = await as('ADMIN');
      await report(admin.auth, team.id, cycle.id).expect(200);
      await report(ana.auth, team.id, cycle.id).expect(200);
    });

    it('miembro del equipo (no líder) -> 403 con code REPORT_FORBIDDEN', async () => {
      const { team, cycle, zeta } = await setup();
      const res = await report(zeta.auth, team.id, cycle.id).expect(403);
      expect(res.body).toEqual({
        statusCode: 403,
        message: 'Solo un ADMIN o el líder del equipo puede ver su reporte',
        code: 'REPORT_FORBIDDEN',
      });
    });

    it('líder de OTRO equipo y usuario sin equipo -> 403', async () => {
      const { team, cycle } = await setup();
      const otherTeam = await createTeam(prisma, { parentId: team.id });
      const otherLead = await as('LEADER');
      await prisma.teamMember.create({
        data: { teamId: otherTeam.id, userId: otherLead.user.id, isLead: true },
      });
      const outsider = await as('MEMBER');
      await report(otherLead.auth, team.id, cycle.id).expect(403);
      await report(outsider.auth, team.id, cycle.id).expect(403);
    });

    it('rol LEADER sin isLead en el equipo -> 403 (el liderazgo lo da la membresía)', async () => {
      const { team, cycle } = await setup();
      const roleOnly = await as('LEADER');
      await prisma.teamMember.create({ data: { teamId: team.id, userId: roleOnly.user.id } });
      await report(roleOnly.auth, team.id, cycle.id).expect(403);
    });

    it('orden de errores: equipo inexistente 404 antes que 403; ciclo inexistente: 403 para no autorizado, 404 para autorizado', async () => {
      const { team, zeta, ana } = await setup();
      await report(zeta.auth, MISSING_ID, MISSING_ID).expect(404);
      await report(zeta.auth, team.id, MISSING_ID).expect(403);
      await report(ana.auth, team.id, MISSING_ID).expect(404);
    });
  });

  it('NO incluye feedback, ni reconocimientos, ni campos tipo ranking/compensación', async () => {
    const { team, cycle, ana, zeta } = await setup();
    const { o, kr } = await objective(cycle.id, { userId: zeta.user.id }, { krScore: 1 });
    await objective(cycle.id, { teamId: team.id });
    const secret = 'feedback-confidencial-abc';
    await http()
      .post('/feedback')
      .set('Authorization', ana.auth)
      .send({ toUserId: zeta.user.id, content: secret, objectiveId: o.id, keyResultId: kr.id })
      .expect(201);

    for (const viewer of [ana, await as('ADMIN')]) {
      const res = await report(viewer.auth, team.id, cycle.id).expect(200);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(secret);
      expect(text).not.toMatch(/feedback|recogni|rank|leaderboard|salary|bonus|compens|rating/i);
    }
  });

  it('ADMIN no ve feedback ajeno ni siquiera como parte del reporte (verificación cruzada con /feedback)', async () => {
    const { ana, zeta } = await setup();
    const admin = await as('ADMIN');
    const sent = await http()
      .post('/feedback')
      .set('Authorization', ana.auth)
      .send({ toUserId: zeta.user.id, content: 'privado' })
      .expect(201);
    await http().get(`/feedback/${sent.body.id}`).set('Authorization', admin.auth).expect(404);
  });

  it('equipo o ciclo inexistente -> 404; cycleId faltante o inválido -> 400; sin token -> 401', async () => {
    const { team, cycle, ana } = await setup();
    await report(ana.auth, MISSING_ID, cycle.id).expect(404);
    await report(ana.auth, team.id, MISSING_ID).expect(404);
    await report(ana.auth, team.id).expect(400);
    await http()
      .get(`/reports/teams/${team.id}?cycleId=no-es-uuid`)
      .set('Authorization', ana.auth)
      .expect(400);
    await http().get(`/reports/teams/${team.id}?cycleId=${cycle.id}`).expect(401);
  });

  it('no existe un reporte individual', async () => {
    const { ana } = await setup();
    await http().get(`/reports/users/${ana.user.id}`).set('Authorization', ana.auth).expect(404);
  });
});
