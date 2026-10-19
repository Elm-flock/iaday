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
  createUser,
  uuid,
} from './helpers/factories';

const LONG_JUSTIFICATION =
  'Preparar este documento en audio exige un estudio externo que hoy no podemos costear.';

describe('Pedidos de documento adaptado a una persona (e2e) RD 707/2026 art. 14.5', () => {
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
  const post = (auth: string, path: string, body: object = {}) =>
    http().post(path).set('Authorization', auth).send(body);
  const get = (auth: string, path: string) => http().get(path).set('Authorization', auth);
  const patch = (auth: string, path: string, body: object) =>
    http().patch(path).set('Authorization', auth).send(body);

  const create = async (auth: string, over: object = {}) =>
    (
      await post(auth, '/adaptation-requests', {
        subject: 'Necesito el reporte del ciclo en lectura fácil',
        preferredFormat: 'LECTURA_FACIL',
        ...over,
      }).expect(201)
    ).body as { id: string; dueDate: string; status: string };

  describe('POST /adaptation-requests', () => {
    it('crea el pedido PENDIENTE con plazo de 10 días y lo audita SIN texto libre', async () => {
      const a = await as('MEMBER');
      const res = await post(a.auth, '/adaptation-requests', {
        subject: 'Necesito el manual en audio',
        description: 'Uso un lector de pantalla y los PDF no se leen bien.',
        preferredFormat: 'AUDIO',
      }).expect(201);
      expect(res.body).toMatchObject({
        requesterId: a.user.id,
        status: 'PENDIENTE',
        preferredFormat: 'AUDIO',
        entityType: null,
        entityId: null,
        assigneeId: null,
        overdue: false,
        rejectionJustification: null,
      });
      const created = new Date(res.body.createdAt).getTime();
      const due = new Date(res.body.dueDate).getTime();
      expect(Math.round((due - created) / 86_400_000)).toBe(10);

      const logs = await prisma.auditLog.findMany();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        actorId: a.user.id,
        action: 'ADAPTATION_REQUEST_CREATED',
        entityType: 'AdaptationRequest',
        entityId: res.body.id,
      });
      const serialized = JSON.stringify(logs);
      expect(serialized).not.toContain('lector de pantalla');
      expect(serialized).not.toContain('manual en audio');
    });

    it('entityType sin entityId (o al revés) -> 400; formato fuera de la lista -> 400', async () => {
      const a = await as('MEMBER');
      await post(a.auth, '/adaptation-requests', {
        subject: 'Algo',
        preferredFormat: 'AUDIO',
        entityType: 'OBJECTIVE',
      }).expect(400);
      await post(a.auth, '/adaptation-requests', {
        subject: 'Algo',
        preferredFormat: 'BRAILLE',
      }).expect(400);
      await post(a.auth, '/adaptation-requests', { preferredFormat: 'AUDIO' }).expect(400);
    });

    it('sin sesión -> 401', async () => {
      await http()
        .post('/adaptation-requests')
        .send({ subject: 'Algo', preferredFormat: 'AUDIO' })
        .expect(401);
    });

    it('vínculo a un objetivo: publicado sí; borrador ajeno -> 404', async () => {
      const owner = await as('MEMBER');
      const other = await as('MEMBER');
      const cycle = await createCycle(prisma);
      const draft = await createObjective(prisma, {
        cycleId: cycle.id,
        createdById: owner.user.id,
        ownerUserId: owner.user.id,
      });
      await post(other.auth, '/adaptation-requests', {
        subject: 'Objetivo en lenguaje claro',
        preferredFormat: 'LENGUAJE_CLARO',
        entityType: 'OBJECTIVE',
        entityId: draft.id,
      }).expect(404);
      const ok = await post(owner.auth, '/adaptation-requests', {
        subject: 'Objetivo en lenguaje claro',
        preferredFormat: 'LENGUAJE_CLARO',
        entityType: 'OBJECTIVE',
        entityId: draft.id,
      }).expect(201);
      expect(ok.body).toMatchObject({ entityType: 'OBJECTIVE', entityId: draft.id });
    });

    it('vínculo a un check-in respeta la visibilidad del objetivo', async () => {
      const owner = await as('MEMBER');
      const other = await as('MEMBER');
      const cycle = await createCycle(prisma);
      const draft = await createObjective(prisma, {
        cycleId: cycle.id,
        createdById: owner.user.id,
        ownerUserId: owner.user.id,
      });
      const kr = await createKeyResult(prisma, { objectiveId: draft.id, ownerId: owner.user.id });
      const ci = await prisma.checkIn.create({
        data: {
          keyResultId: kr.id,
          authorId: owner.user.id,
          score: 0.5,
          band: 'YELLOW',
          action: 'UPDATE',
        },
      });
      const body = {
        subject: 'Check-in en lectura fácil',
        preferredFormat: 'LECTURA_FACIL',
        entityType: 'CHECK_IN',
        entityId: ci.id,
      };
      await post(other.auth, '/adaptation-requests', body).expect(404);
      await post(owner.auth, '/adaptation-requests', body).expect(201);
      await post(owner.auth, '/adaptation-requests', { ...body, entityId: uuid() }).expect(404);
    });

    describe('vínculo a un feedback', () => {
      const setup = async () => {
        const sender = await as('MEMBER');
        const receiver = await as('MEMBER');
        const admin = await as('ADMIN');
        const stranger = await as('LEADER');
        const fb = await prisma.feedback.create({
          data: {
            fromUserId: sender.user.id,
            toUserId: receiver.user.id,
            content: 'Contenido privado del feedback',
          },
        });
        return { sender, receiver, admin, stranger, fb };
      };
      const body = (fbId: string) => ({
        subject: 'Feedback en lenguaje claro',
        preferredFormat: 'LENGUAJE_CLARO',
        entityType: 'FEEDBACK',
        entityId: fbId,
      });

      it('emisor y receptor pueden vincularlo; ADMIN y terceros reciben 404 (sin bypass)', async () => {
        const w = await setup();
        await post(w.sender.auth, '/adaptation-requests', body(w.fb.id)).expect(201);
        await post(w.receiver.auth, '/adaptation-requests', body(w.fb.id)).expect(201);
        await post(w.admin.auth, '/adaptation-requests', body(w.fb.id)).expect(404);
        await post(w.stranger.auth, '/adaptation-requests', body(w.fb.id)).expect(404);
        await post(w.sender.auth, '/adaptation-requests', body(uuid())).expect(404);
      });

      it('administración ve el pedido pero NO el id del feedback; el auditor tampoco lo ve en el log', async () => {
        const w = await setup();
        const mine = await post(w.sender.auth, '/adaptation-requests', body(w.fb.id)).expect(201);
        expect(mine.body.entityId).toBe(w.fb.id);
        const asAdmin = await get(w.admin.auth, `/adaptation-requests/${mine.body.id}`).expect(200);
        expect(asAdmin.body).toMatchObject({ entityType: 'FEEDBACK', entityId: null });
        const list = await get(w.admin.auth, '/adaptation-requests').expect(200);
        expect(list.body.items[0]).toMatchObject({ entityType: 'FEEDBACK', entityId: null });
        const logs = JSON.stringify(await prisma.auditLog.findMany());
        expect(logs).not.toContain(w.fb.id);
        expect(logs).not.toContain('Contenido privado');
      });
    });
  });

  describe('lectura y privacidad', () => {
    it('GET /mine lista solo los propios; GET /:id de otra persona -> 404 (ni existencia)', async () => {
      const a = await as('MEMBER');
      const b = await as('MEMBER');
      const ra = await create(a.auth);
      await create(b.auth);
      const mine = await get(a.auth, '/adaptation-requests/mine').expect(200);
      expect(mine.body).toMatchObject({ total: 1, page: 1, limit: 20 });
      expect(mine.body.items[0].id).toBe(ra.id);
      await get(b.auth, `/adaptation-requests/${ra.id}`).expect(404);
      await get(b.auth, `/adaptation-requests/${uuid()}`).expect(404);
      await get(a.auth, `/adaptation-requests/${ra.id}`).expect(200);
      await get(a.auth, '/adaptation-requests/no-es-uuid').expect(400);
    });

    it('un LEADER tampoco ve los pedidos ajenos ni el listado general', async () => {
      const a = await as('MEMBER');
      const lead = await as('LEADER');
      const ra = await create(a.auth);
      await get(lead.auth, `/adaptation-requests/${ra.id}`).expect(404);
      await get(lead.auth, '/adaptation-requests').expect(403);
      await get(a.auth, '/adaptation-requests').expect(403);
    });

    it('ADMIN lista todos con filtros de estado y vencidos', async () => {
      const a = await as('MEMBER');
      const admin = await as('ADMIN');
      const old = await create(a.auth);
      await create(a.auth);
      await prisma.adaptationRequest.update({
        where: { id: old.id },
        data: { dueDate: new Date(Date.now() - 86_400_000) },
      });

      const all = await get(admin.auth, '/adaptation-requests').expect(200);
      expect(all.body.total).toBe(2);
      const overdue = await get(admin.auth, '/adaptation-requests?overdue=true').expect(200);
      expect(overdue.body.total).toBe(1);
      expect(overdue.body.items[0]).toMatchObject({ id: old.id, overdue: true });
      const onTime = await get(admin.auth, '/adaptation-requests?overdue=false').expect(200);
      expect(onTime.body.total).toBe(1);
      expect(onTime.body.items[0].overdue).toBe(false);
      const pending = await get(admin.auth, '/adaptation-requests?status=PENDIENTE').expect(200);
      expect(pending.body.total).toBe(2);
      const done = await get(admin.auth, '/adaptation-requests?status=ENTREGADA').expect(200);
      expect(done.body.total).toBe(0);
      await get(admin.auth, '/adaptation-requests?status=NOPE').expect(400);
      await get(admin.auth, '/adaptation-requests?limit=500').expect(400);
    });

    it('un pedido resuelto nunca figura como vencido', async () => {
      const a = await as('MEMBER');
      const admin = await as('ADMIN');
      const r = await create(a.auth);
      await prisma.adaptationRequest.update({
        where: { id: r.id },
        data: { dueDate: new Date(Date.now() - 86_400_000) },
      });
      await post(admin.auth, `/adaptation-requests/${r.id}/deliver`, {
        resolutionNote: 'Ya te lo enviamos por mail.',
      }).expect(200);
      const res = await get(admin.auth, '/adaptation-requests?overdue=true').expect(200);
      expect(res.body.total).toBe(0);
    });
  });

  describe('gestión (solo ADMIN)', () => {
    it('quien no es ADMIN no puede asignar, entregar ni rechazar (403)', async () => {
      const a = await as('MEMBER');
      const lead = await as('LEADER');
      const admin = await as('ADMIN');
      const r = await create(a.auth);
      for (const who of [a, lead]) {
        await patch(who.auth, `/adaptation-requests/${r.id}/assign`, {
          assigneeId: admin.user.id,
        }).expect(403);
        await post(who.auth, `/adaptation-requests/${r.id}/deliver`, {
          resolutionNote: 'Esto no debería poder hacerlo',
        }).expect(403);
        await post(who.auth, `/adaptation-requests/${r.id}/reject`, {
          justification: LONG_JUSTIFICATION,
        }).expect(403);
      }
    });

    it('asignar pasa a EN_CURSO y audita ids/estado; solo a ADMIN activo', async () => {
      const a = await as('MEMBER');
      const admin = await as('ADMIN');
      const lead = await as('LEADER');
      const inactive = await createUser(prisma, { role: 'ADMIN', active: false });
      const r = await create(a.auth);

      const bad = await patch(admin.auth, `/adaptation-requests/${r.id}/assign`, {
        assigneeId: lead.user.id,
      }).expect(422);
      expect(bad.body.code).toBe('ADAPTATION_ASSIGNEE_INVALID');
      await patch(admin.auth, `/adaptation-requests/${r.id}/assign`, {
        assigneeId: inactive.id,
      }).expect(422);
      await patch(admin.auth, `/adaptation-requests/${r.id}/assign`, {
        assigneeId: uuid(),
      }).expect(422);
      await patch(admin.auth, `/adaptation-requests/${uuid()}/assign`, {
        assigneeId: admin.user.id,
      }).expect(404);

      const res = await patch(admin.auth, `/adaptation-requests/${r.id}/assign`, {
        assigneeId: admin.user.id,
      }).expect(200);
      expect(res.body).toMatchObject({
        status: 'EN_CURSO',
        assigneeId: admin.user.id,
        assigneeName: admin.user.name,
      });
      const log = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'ADAPTATION_REQUEST_ASSIGNED' },
      });
      expect(log).toMatchObject({
        actorId: admin.user.id,
        entityId: r.id,
        before: { status: 'PENDIENTE', assigneeId: null },
        after: { status: 'EN_CURSO', assigneeId: admin.user.id },
      });
    });

    it('entregar guarda nota y enlace, la persona los ve y se audita sin la nota', async () => {
      const a = await as('MEMBER');
      const admin = await as('ADMIN');
      const r = await create(a.auth);
      await post(admin.auth, `/adaptation-requests/${r.id}/deliver`, {}).expect(422);
      await post(admin.auth, `/adaptation-requests/${r.id}/deliver`, {
        resolutionNote: 'corta',
      }).expect(422);
      await post(admin.auth, `/adaptation-requests/${r.id}/deliver`, {
        resolutionNote: 'Te dejamos el reporte en lectura fácil.',
        resolutionLink: 'javascript:alert(1)',
      }).expect(400);

      const res = await post(admin.auth, `/adaptation-requests/${r.id}/deliver`, {
        resolutionNote: 'Te dejamos el reporte en lectura fácil.',
        resolutionLink: 'https://docs.flockit.test/reporte-facil',
      }).expect(200);
      expect(res.body).toMatchObject({
        status: 'ENTREGADA',
        assigneeId: admin.user.id,
        resolutionLink: 'https://docs.flockit.test/reporte-facil',
        overdue: false,
      });
      expect(res.body.resolvedAt).not.toBeNull();
      const seen = await get(a.auth, `/adaptation-requests/${r.id}`).expect(200);
      expect(seen.body.resolutionNote).toBe('Te dejamos el reporte en lectura fácil.');

      const log = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'ADAPTATION_REQUEST_DELIVERED' },
      });
      expect(log.after).toEqual({ status: 'ENTREGADA', assigneeId: admin.user.id });
      expect(JSON.stringify(log)).not.toContain('lectura fácil');
    });

    it('rechazar SIN justificación (o muy corta) -> 422 con código y el pedido no cambia', async () => {
      const a = await as('MEMBER');
      const admin = await as('ADMIN');
      const r = await create(a.auth);
      for (const body of [
        {},
        { justification: '' },
        { justification: '   ' },
        { justification: 'no' },
      ]) {
        const res = await post(admin.auth, `/adaptation-requests/${r.id}/reject`, body).expect(422);
        expect(res.body).toMatchObject({
          statusCode: 422,
          code: 'ADAPTATION_REJECTION_JUSTIFICATION_REQUIRED',
        });
      }
      const still = await get(a.auth, `/adaptation-requests/${r.id}`).expect(200);
      expect(still.body).toMatchObject({ status: 'PENDIENTE', rejectionJustification: null });
      expect(
        await prisma.auditLog.count({ where: { action: 'ADAPTATION_REQUEST_REJECTED' } }),
      ).toBe(0);
    });

    it('rechazar con justificación -> RECHAZADA; la persona la ve; auditoría sin el texto', async () => {
      const a = await as('MEMBER');
      const admin = await as('ADMIN');
      const r = await create(a.auth);
      const res = await post(admin.auth, `/adaptation-requests/${r.id}/reject`, {
        justification: LONG_JUSTIFICATION,
      }).expect(200);
      expect(res.body).toMatchObject({
        status: 'RECHAZADA',
        rejectionJustification: LONG_JUSTIFICATION,
        assigneeId: admin.user.id,
      });
      const seen = await get(a.auth, `/adaptation-requests/${r.id}`).expect(200);
      expect(seen.body.rejectionJustification).toBe(LONG_JUSTIFICATION);
      const log = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'ADAPTATION_REQUEST_REJECTED' },
      });
      expect(log).toMatchObject({
        actorId: admin.user.id,
        before: { status: 'PENDIENTE' },
        after: { status: 'RECHAZADA', assigneeId: admin.user.id },
      });
      expect(JSON.stringify(log)).not.toContain('estudio externo');
    });

    it('un pedido resuelto es terminal: asignar/entregar/rechazar de nuevo -> 409', async () => {
      const a = await as('MEMBER');
      const admin = await as('ADMIN');
      const r = await create(a.auth);
      await post(admin.auth, `/adaptation-requests/${r.id}/reject`, {
        justification: LONG_JUSTIFICATION,
      }).expect(200);
      await patch(admin.auth, `/adaptation-requests/${r.id}/assign`, {
        assigneeId: admin.user.id,
      }).expect(409);
      await post(admin.auth, `/adaptation-requests/${r.id}/deliver`, {
        resolutionNote: 'Ahora sí lo entregamos',
      }).expect(409);
      const again = await post(admin.auth, `/adaptation-requests/${r.id}/reject`, {
        justification: LONG_JUSTIFICATION,
      }).expect(409);
      expect(again.body.code).toBe('ADAPTATION_REQUEST_STATE_CONFLICT');
    });

    it('el plazo es configurable con ADAPTATION_DUE_DAYS', async () => {
      process.env.ADAPTATION_DUE_DAYS = '3';
      try {
        const a = await as('MEMBER');
        const r = await create(a.auth);
        const row = await prisma.adaptationRequest.findUniqueOrThrow({ where: { id: r.id } });
        expect(Math.round((row.dueDate.getTime() - row.createdAt.getTime()) / 86_400_000)).toBe(3);
      } finally {
        delete process.env.ADAPTATION_DUE_DAYS;
      }
    });
  });
});
