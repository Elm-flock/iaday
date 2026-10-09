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

describe('Feedback privado (e2e) REQ-FDB-1', () => {
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

  const send = (auth: string, payload: object) =>
    http().post('/feedback').set('Authorization', auth).send(payload);
  const get = (auth: string, path: string) => http().get(path).set('Authorization', auth);

  /** Feedback de `from` a `to` creado por la API (camino real). */
  const feedbackFrom = async (
    from: { auth: string },
    to: { user: { id: string } },
    content = 'Excelente presentación',
  ) => {
    const res = await send(from.auth, { toUserId: to.user.id, content }).expect(201);
    return res.body as { id: string };
  };

  describe('POST /feedback', () => {
    it('crea el feedback -> 201 sin leer; el DTO no expone nombres', async () => {
      const a = await as('MEMBER');
      const b = await as('MEMBER');
      const res = await send(a.auth, {
        toUserId: b.user.id,
        content: 'Gracias por la ayuda',
      }).expect(201);
      expect(res.body).toMatchObject({
        fromUserId: a.user.id,
        toUserId: b.user.id,
        content: 'Gracias por la ayuda',
        objectiveId: null,
        keyResultId: null,
        readAt: null,
        editedAt: null,
      });
    });

    it('autoenvío -> 400 con código FEEDBACK_SELF_SEND', async () => {
      const a = await as('MEMBER');
      const res = await send(a.auth, { toUserId: a.user.id, content: 'Hola yo' }).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, code: 'FEEDBACK_SELF_SEND' });
      expect(typeof res.body.message).toBe('string');
    });

    it('destinatario inexistente -> 404', async () => {
      const a = await as('MEMBER');
      await send(a.auth, { toUserId: MISSING_ID, content: 'Hola' }).expect(404);
    });

    it('contenido vacío o campos no declarados (fromUserId) -> 400', async () => {
      const a = await as('MEMBER');
      const b = await as('MEMBER');
      await send(a.auth, { toUserId: b.user.id, content: '' }).expect(400);
      await send(a.auth, { toUserId: b.user.id, content: 'x', fromUserId: b.user.id }).expect(400);
    });

    it('puede enlazar un objetivo o KR visible; uno inexistente -> 404', async () => {
      const a = await as('MEMBER');
      const b = await as('MEMBER');
      const cycle = await createCycle(prisma);
      const objective = await createObjective(prisma, {
        cycleId: cycle.id,
        createdById: b.user.id,
        ownerUserId: b.user.id,
      });
      await prisma.objective.update({
        where: { id: objective.id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
      const kr = await createKeyResult(prisma, { objectiveId: objective.id, ownerId: b.user.id });

      const res = await send(a.auth, {
        toUserId: b.user.id,
        content: 'Buen avance',
        objectiveId: objective.id,
        keyResultId: kr.id,
      }).expect(201);
      expect(res.body).toMatchObject({ objectiveId: objective.id, keyResultId: kr.id });
      await send(a.auth, { toUserId: b.user.id, content: 'x', objectiveId: MISSING_ID }).expect(
        404,
      );
    });

    it('sin token -> 401', async () => {
      await http().post('/feedback').send({}).expect(401);
    });
  });

  describe('GET /feedback (listado)', () => {
    it('emisor y receptor lo ven; box filtra recibidos / enviados', async () => {
      const a = await as('MEMBER');
      const b = await as('MEMBER');
      const c = await as('MEMBER');
      const ab = await feedbackFrom(a, b, 'de A a B');
      const bc = await feedbackFrom(b, c, 'de B a C');

      const ids = (r: { body: { id: string }[] }) => r.body.map((f) => f.id).sort();
      expect(ids(await get(b.auth, '/feedback?box=received').expect(200))).toEqual([ab.id]);
      expect(ids(await get(b.auth, '/feedback?box=sent').expect(200))).toEqual([bc.id]);
      expect(ids(await get(b.auth, '/feedback').expect(200))).toEqual([ab.id, bc.id].sort());
      expect(ids(await get(a.auth, '/feedback').expect(200))).toEqual([ab.id]);
    });

    it('un tercero, el LÍDER del receptor y el ADMIN NO lo ven en el listado', async () => {
      const a = await as('MEMBER');
      const b = await as('MEMBER');
      const lead = await as('LEADER');
      const admin = await as('ADMIN');
      const team = await createTeam(prisma);
      await prisma.teamMember.create({ data: { teamId: team.id, userId: b.user.id } });
      await prisma.teamMember.create({
        data: { teamId: team.id, userId: lead.user.id, isLead: true },
      });
      await feedbackFrom(a, b);

      for (const who of [lead, admin]) {
        expect((await get(who.auth, '/feedback').expect(200)).body).toEqual([]);
        expect((await get(who.auth, '/feedback?box=received').expect(200)).body).toEqual([]);
        expect((await get(who.auth, '/feedback?box=sent').expect(200)).body).toEqual([]);
      }
    });

    it('box inválido -> 400; sin token -> 401', async () => {
      const a = await as('MEMBER');
      await get(a.auth, '/feedback?box=todos').expect(400);
      await http().get('/feedback').expect(401);
    });
  });

  describe('GET /feedback/:id', () => {
    it('emisor y receptor -> 200', async () => {
      const a = await as('MEMBER');
      const b = await as('MEMBER');
      const fb = await feedbackFrom(a, b);
      await get(a.auth, `/feedback/${fb.id}`).expect(200);
      await get(b.auth, `/feedback/${fb.id}`).expect(200);
    });

    it('ADMIN, LÍDER del receptor y tercero -> 404 (no 403: no revela que existe)', async () => {
      const a = await as('MEMBER');
      const b = await as('MEMBER');
      const lead = await as('LEADER');
      const admin = await as('ADMIN');
      const third = await as('MEMBER');
      const team = await createTeam(prisma);
      await prisma.teamMember.create({ data: { teamId: team.id, userId: b.user.id } });
      await prisma.teamMember.create({
        data: { teamId: team.id, userId: lead.user.id, isLead: true },
      });
      const fb = await feedbackFrom(a, b);

      for (const who of [admin, lead, third]) {
        await get(who.auth, `/feedback/${fb.id}`).expect(404);
        await http()
          .patch(`/feedback/${fb.id}`)
          .set('Authorization', who.auth)
          .send({ content: 'intruso' })
          .expect(404);
        await http().patch(`/feedback/${fb.id}/read`).set('Authorization', who.auth).expect(404);
        await http().delete(`/feedback/${fb.id}`).set('Authorization', who.auth).expect(404);
      }
      // Y nada se modificó ni se borró.
      const row = await prisma.feedback.findUniqueOrThrow({ where: { id: fb.id } });
      expect(row.content).toBe('Excelente presentación');
      expect(row.readAt).toBeNull();
    });

    it('id inexistente -> 404 igual que uno ajeno; id no UUID -> 400', async () => {
      const a = await as('MEMBER');
      await get(a.auth, `/feedback/${MISSING_ID}`).expect(404);
      await get(a.auth, '/feedback/no-es-uuid').expect(400);
    });
  });

  describe('PATCH /feedback/:id/read', () => {
    it('el receptor lo marca como leído; el emisor -> 403; es idempotente', async () => {
      const a = await as('MEMBER');
      const b = await as('MEMBER');
      const fb = await feedbackFrom(a, b);

      await http().patch(`/feedback/${fb.id}/read`).set('Authorization', a.auth).expect(403);
      const first = await http()
        .patch(`/feedback/${fb.id}/read`)
        .set('Authorization', b.auth)
        .expect(200);
      expect(first.body.readAt).not.toBeNull();
      const second = await http()
        .patch(`/feedback/${fb.id}/read`)
        .set('Authorization', b.auth)
        .expect(200);
      expect(second.body.readAt).toBe(first.body.readAt);
    });

    it('marcar como leído NO marca el feedback como editado', async () => {
      const a = await as('MEMBER');
      const b = await as('MEMBER');
      const fb = await feedbackFrom(a, b);
      const res = await http()
        .patch(`/feedback/${fb.id}/read`)
        .set('Authorization', b.auth)
        .expect(200);
      expect(typeof res.body.readAt).toBe('string');
      expect(res.body.editedAt).toBeNull();
      expect(res.body).not.toHaveProperty('updatedAt');
    });
  });

  describe('PATCH/DELETE /feedback/:id (autor)', () => {
    it('el autor edita el contenido; el receptor -> 403', async () => {
      const a = await as('MEMBER');
      const b = await as('MEMBER');
      const fb = await feedbackFrom(a, b);

      const res = await http()
        .patch(`/feedback/${fb.id}`)
        .set('Authorization', a.auth)
        .send({ content: 'Texto corregido' })
        .expect(200);
      expect(res.body.content).toBe('Texto corregido');
      expect(typeof res.body.editedAt).toBe('string');
      await http()
        .patch(`/feedback/${fb.id}`)
        .set('Authorization', b.auth)
        .send({ content: 'No es mío' })
        .expect(403);
      await http()
        .patch(`/feedback/${fb.id}`)
        .set('Authorization', a.auth)
        .send({ content: '' })
        .expect(400);
    });

    it('el autor borra -> 204 y desaparece; el receptor -> 403', async () => {
      const a = await as('MEMBER');
      const b = await as('MEMBER');
      const fb = await feedbackFrom(a, b);

      await http().delete(`/feedback/${fb.id}`).set('Authorization', b.auth).expect(403);
      await http().delete(`/feedback/${fb.id}`).set('Authorization', a.auth).expect(204);
      await get(a.auth, `/feedback/${fb.id}`).expect(404);
      await get(b.auth, `/feedback/${fb.id}`).expect(404);
    });
  });

  describe('el feedback no aparece en auditoría', () => {
    it('crear, leer, editar y borrar feedback NO genera AuditLog ni se filtra en GET /audit', async () => {
      const a = await as('MEMBER');
      const b = await as('MEMBER');
      const admin = await as('ADMIN');
      const secret = 'contenido-confidencial-xyz';
      const fb = await feedbackFrom(a, b, secret);
      await http().patch(`/feedback/${fb.id}/read`).set('Authorization', b.auth).expect(200);
      await http()
        .patch(`/feedback/${fb.id}`)
        .set('Authorization', a.auth)
        .send({ content: `${secret}-editado` })
        .expect(200);
      await http().delete(`/feedback/${fb.id}`).set('Authorization', a.auth).expect(204);

      expect(await prisma.auditLog.count({ where: { entityType: 'Feedback' } })).toBe(0);
      const res = await get(admin.auth, '/audit?limit=100').expect(200);
      expect(JSON.stringify(res.body)).not.toContain(secret);
      expect(JSON.stringify(res.body)).not.toContain(fb.id);
    });
  });
});
