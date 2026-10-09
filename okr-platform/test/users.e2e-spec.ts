import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { bearer } from './helpers/auth';
import { truncateAll } from './helpers/db';
import { createUser, DEFAULT_PASSWORD } from './helpers/factories';

const MISSING_ID = '6f1c2f0e-3b8d-4a52-9c5e-1d2a3b4c5d6e';

describe('Users (e2e)', () => {
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

  const newUser = { email: 'Nueva@Test.Local', name: 'Nueva', password: 'ClaveSegura123!' };

  describe('POST /users (REQ-AUTH-2)', () => {
    it('MEMBER -> 403', async () => {
      const { auth } = await as('MEMBER');
      await http().post('/users').set('Authorization', auth).send(newUser).expect(403);
    });

    it('LEADER -> 403', async () => {
      const { auth } = await as('LEADER');
      await http().post('/users').set('Authorization', auth).send(newUser).expect(403);
    });

    it('sin token -> 401', async () => {
      await http().post('/users').send(newUser).expect(401);
    });

    it('ADMIN -> 201, email en minúsculas, rol MEMBER por defecto, sin passwordHash, y puede loguearse', async () => {
      const { auth } = await as('ADMIN');
      const res = await http().post('/users').set('Authorization', auth).send(newUser).expect(201);
      expect(res.body).toMatchObject({
        email: 'nueva@test.local',
        name: 'Nueva',
        role: 'MEMBER',
        active: true,
      });
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(res.body).not.toHaveProperty('password');

      const row = await prisma.user.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.passwordHash).toMatch(/^\$argon2id\$/);

      await http()
        .post('/auth/login')
        .send({ email: 'nueva@test.local', password: newUser.password })
        .expect(200);
    });

    it('ADMIN puede fijar el rol al crear', async () => {
      const { auth } = await as('ADMIN');
      const res = await http()
        .post('/users')
        .set('Authorization', auth)
        .send({ ...newUser, role: 'LEADER' })
        .expect(201);
      expect(res.body.role).toBe('LEADER');
    });

    it('email duplicado (sin distinguir mayúsculas) -> 409', async () => {
      const { auth } = await as('ADMIN');
      await http().post('/users').set('Authorization', auth).send(newUser).expect(201);
      await http()
        .post('/users')
        .set('Authorization', auth)
        .send({ ...newUser, email: 'nueva@test.local' })
        .expect(409);
    });

    it('body inválido o con campos extra -> 400', async () => {
      const { auth } = await as('ADMIN');
      const post = (body: object) => http().post('/users').set('Authorization', auth).send(body);
      await post({ ...newUser, email: 'no-es-email' }).expect(400);
      await post({ ...newUser, password: 'corta' }).expect(400);
      await post({ ...newUser, passwordHash: 'x' }).expect(400);
      await post({ ...newUser, active: false }).expect(400);
      await post({ ...newUser, role: 'SUPERADMIN' }).expect(400);
    });
  });

  describe('GET /users', () => {
    it('cualquier autenticado lista el directorio; sin token -> 401', async () => {
      const { auth } = await as('MEMBER');
      await createUser(prisma, { name: 'Otra Persona' });
      const res = await http().get('/users').set('Authorization', auth).expect(200);
      expect(res.body).toHaveLength(2);
      for (const u of res.body as Record<string, unknown>[]) {
        expect(Object.keys(u).sort()).toEqual(['active', 'email', 'id', 'name', 'role']);
      }
      await http().get('/users').expect(401);
    });
  });

  describe('PATCH /users/:id', () => {
    it('MEMBER -> 403', async () => {
      const { auth, user } = await as('MEMBER');
      await http()
        .patch(`/users/${user.id}`)
        .set('Authorization', auth)
        .send({ name: 'X' })
        .expect(403);
    });

    it('ADMIN cambia nombre y rol: audita USER_ROLE_CHANGED con antes/después', async () => {
      const { auth, user: admin } = await as('ADMIN');
      const target = await createUser(prisma, { role: 'MEMBER' });
      const res = await http()
        .patch(`/users/${target.id}`)
        .set('Authorization', auth)
        .send({ name: 'Nuevo Nombre', role: 'LEADER' })
        .expect(200);
      expect(res.body).toMatchObject({ id: target.id, name: 'Nuevo Nombre', role: 'LEADER' });

      const audit = await prisma.auditLog.findMany({ where: { action: 'USER_ROLE_CHANGED' } });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        actorId: admin.id,
        entityType: 'User',
        entityId: target.id,
        before: { role: 'MEMBER' },
        after: { role: 'LEADER' },
      });
    });

    it('cambiar solo el nombre no audita', async () => {
      const { auth } = await as('ADMIN');
      const target = await createUser(prisma);
      await http()
        .patch(`/users/${target.id}`)
        .set('Authorization', auth)
        .send({ name: 'Solo Nombre' })
        .expect(200);
      expect(await prisma.auditLog.count()).toBe(0);
    });

    it('desactivar: audita USER_DEACTIVATED, revoca refresh y el access token deja de servir (401)', async () => {
      const { auth, user: admin } = await as('ADMIN');
      const target = await createUser(prisma);
      const login = await http()
        .post('/auth/login')
        .send({ email: target.email, password: DEFAULT_PASSWORD })
        .expect(200);
      const targetAuth = `Bearer ${login.body.accessToken as string}`;
      await http().get('/auth/me').set('Authorization', targetAuth).expect(200);

      await http()
        .patch(`/users/${target.id}`)
        .set('Authorization', auth)
        .send({ active: false })
        .expect(200);

      await http().get('/auth/me').set('Authorization', targetAuth).expect(401);
      await http()
        .post('/auth/refresh')
        .send({ refreshToken: login.body.refreshToken })
        .expect(401);
      expect(
        await prisma.refreshToken.count({ where: { userId: target.id, revokedAt: null } }),
      ).toBe(0);

      const audit = await prisma.auditLog.findMany({ where: { action: 'USER_DEACTIVATED' } });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ actorId: admin.id, entityId: target.id });
    });

    it('reactivar un usuario no genera USER_DEACTIVATED', async () => {
      const { auth } = await as('ADMIN');
      const target = await createUser(prisma, { active: false });
      await http()
        .patch(`/users/${target.id}`)
        .set('Authorization', auth)
        .send({ active: true })
        .expect(200);
      expect(await prisma.auditLog.count()).toBe(0);
    });

    it('el ADMIN no puede desactivarse ni cambiarse el rol a sí mismo -> 422', async () => {
      const { auth, user: admin } = await as('ADMIN');
      const patch = (body: object) =>
        http().patch(`/users/${admin.id}`).set('Authorization', auth).send(body);
      await patch({ active: false }).expect(422);
      await patch({ role: 'MEMBER' }).expect(422);
      await patch({ name: 'Mi nombre' }).expect(200);
    });

    it('usuario inexistente -> 404; id no uuid -> 400; campos no declarados -> 400', async () => {
      const { auth } = await as('ADMIN');
      const target = await createUser(prisma);
      await http()
        .patch(`/users/${MISSING_ID}`)
        .set('Authorization', auth)
        .send({ name: 'X' })
        .expect(404);
      await http()
        .patch('/users/no-uuid')
        .set('Authorization', auth)
        .send({ name: 'X' })
        .expect(400);
      await http()
        .patch(`/users/${target.id}`)
        .set('Authorization', auth)
        .send({ passwordHash: 'x' })
        .expect(400);
    });
  });

  describe('POST /users/:id/password', () => {
    it('ADMIN resetea la clave: la nueva sirve, la vieja no, y se revocan los refresh', async () => {
      const { auth } = await as('ADMIN');
      const target = await createUser(prisma);
      const login = await http()
        .post('/auth/login')
        .send({ email: target.email, password: DEFAULT_PASSWORD })
        .expect(200);

      await http()
        .post(`/users/${target.id}/password`)
        .set('Authorization', auth)
        .send({ password: 'OtraClaveNueva456!' })
        .expect(204);

      await http()
        .post('/auth/login')
        .send({ email: target.email, password: DEFAULT_PASSWORD })
        .expect(401);
      await http()
        .post('/auth/login')
        .send({ email: target.email, password: 'OtraClaveNueva456!' })
        .expect(200);
      await http()
        .post('/auth/refresh')
        .send({ refreshToken: login.body.refreshToken })
        .expect(401);
    });

    it('MEMBER -> 403; clave corta -> 400; usuario inexistente -> 404', async () => {
      const member = await as('MEMBER');
      const { auth } = await as('ADMIN');
      const target = await createUser(prisma);
      await http()
        .post(`/users/${target.id}/password`)
        .set('Authorization', member.auth)
        .send({ password: 'OtraClaveNueva456!' })
        .expect(403);
      await http()
        .post(`/users/${target.id}/password`)
        .set('Authorization', auth)
        .send({ password: 'corta' })
        .expect(400);
      await http()
        .post(`/users/${MISSING_ID}/password`)
        .set('Authorization', auth)
        .send({ password: 'OtraClaveNueva456!' })
        .expect(404);
    });
  });
});
