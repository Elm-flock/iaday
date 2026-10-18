import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { bearer } from './helpers/auth';
import { truncateAll } from './helpers/db';
import { createUser, DEFAULT_PASSWORD } from './helpers/factories';

const NEW_PASSWORD = 'UnaClaveNuevaMuyLarga-2026';

describe('Clave inicial: mustChangePassword (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  afterAll(() => app.close());
  beforeEach(() => truncateAll(prisma));

  const adminAuth = async () => {
    const admin = await createUser(prisma, { role: 'ADMIN' });
    return { admin, auth: await bearer(app, admin) };
  };
  const login = (email: string, password: string) =>
    http().post('/auth/login').send({ email, password });

  /** Alta por administración sin clave: devuelve la persona y su clave inicial generada. */
  async function createdWithGeneratedPassword(email = 'nueva@test.local') {
    const { auth } = await adminAuth();
    const res = await http()
      .post('/users')
      .set('Authorization', auth)
      .send({ email, name: 'Nueva Persona' })
      .expect(201);
    return { body: res.body, password: res.body.initialPassword as string, email };
  }

  describe('alta por administración', () => {
    it('sin password: genera una clave aleatoria, la muestra UNA vez y la cuenta nace con mustChangePassword', async () => {
      const { body, password, email } = await createdWithGeneratedPassword();
      expect(body.mustChangePassword).toBe(true);
      expect(password).toMatch(/^[A-Za-z0-9_-]{20}$/);
      expect(body).not.toHaveProperty('passwordHash');
      const row = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(row.passwordHash).toMatch(/^\$argon2id\$/);
      expect(row.passwordHash).not.toContain(password);
      expect(row.mustChangePassword).toBe(true);

      // No vuelve a aparecer en ningún listado.
      const { auth } = await adminAuth();
      const list = await http().get('/users').set('Authorization', auth).expect(200);
      expect(JSON.stringify(list.body)).not.toContain(password);
      // El directorio no revela quién tiene pendiente el cambio de clave.
      expect(list.body.find((u: { email: string }) => u.email === email)).not.toHaveProperty(
        'mustChangePassword',
      );
    });

    it('con password (compatibilidad con la UI actual): no devuelve initialPassword pero igual exige cambiarla', async () => {
      const { auth } = await adminAuth();
      const res = await http()
        .post('/users')
        .set('Authorization', auth)
        .send({ email: 'otra@test.local', name: 'Otra', password: 'ClaveDeAdmin123' })
        .expect(201);
      expect(res.body.mustChangePassword).toBe(true);
      expect(res.body).not.toHaveProperty('initialPassword');
      const loginRes = await login('otra@test.local', 'ClaveDeAdmin123').expect(200);
      expect(loginRes.body.user.mustChangePassword).toBe(true);
    });

    it('la clave jamás queda en el AuditLog ni en logs de la base', async () => {
      const { password } = await createdWithGeneratedPassword();
      const audit = await prisma.auditLog.findMany();
      expect(JSON.stringify(audit)).not.toContain(password);
    });

    it('el reset de clave por administración también fuerza el cambio', async () => {
      const { auth } = await adminAuth();
      const target = await createUser(prisma);
      expect(target.mustChangePassword).toBe(false);
      await http()
        .post(`/users/${target.id}/password`)
        .set('Authorization', auth)
        .send({ password: 'ClaveNuevaDeAdmin1' })
        .expect(204);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).mustChangePassword,
      ).toBe(true);
    });
  });

  describe('mientras tenga la clave inicial', () => {
    it('el login lo informa y solo funcionan cambiar la clave, /auth/me, refresh y logout; el resto es 403 PASSWORD_CHANGE_REQUIRED', async () => {
      const { password, email } = await createdWithGeneratedPassword();
      const session = (await login(email, password).expect(200)).body;
      expect(session.user.mustChangePassword).toBe(true);
      const auth = `Bearer ${session.accessToken}`;

      for (const path of ['/users', '/objectives', '/cycles', '/teams', '/assistant/digest']) {
        const res = await http().get(path).set('Authorization', auth);
        expect([path, res.status]).toEqual([path, 403]);
        expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
      }
      const me = await http().get('/auth/me').set('Authorization', auth).expect(200);
      expect(me.body.mustChangePassword).toBe(true);

      const refreshed = await http()
        .post('/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(200);
      expect(refreshed.body.user.mustChangePassword).toBe(true);
      await http()
        .post('/auth/logout')
        .send({ refreshToken: refreshed.body.refreshToken })
        .expect(204);
    });

    it('cambiar la clave: valida la actual y la nueva', async () => {
      const { password, email } = await createdWithGeneratedPassword();
      const session = (await login(email, password).expect(200)).body;
      const auth = `Bearer ${session.accessToken}`;
      const change = (body: object) =>
        http().post('/auth/change-password').set('Authorization', auth).send(body);

      expect(
        (
          await change({ currentPassword: 'incorrecta-123456', newPassword: NEW_PASSWORD }).expect(
            422,
          )
        ).body.code,
      ).toBe('INVALID_CURRENT_PASSWORD');
      expect(
        (await change({ currentPassword: password, newPassword: password }).expect(422)).body.code,
      ).toBe('PASSWORD_UNCHANGED');
      await change({ currentPassword: password, newPassword: 'corta' }).expect(400);
      await change({ currentPassword: password }).expect(400);
      await change({ currentPassword: password, newPassword: NEW_PASSWORD, role: 'ADMIN' }).expect(
        400,
      );
      await http()
        .post('/auth/change-password')
        .send({ currentPassword: password, newPassword: NEW_PASSWORD })
        .expect(401);
      expect((await prisma.user.findUniqueOrThrow({ where: { email } })).mustChangePassword).toBe(
        true,
      );
    });

    it('cambiar la clave apaga el flag, revoca las demás sesiones, audita el hecho y devuelve una sesión nueva', async () => {
      const { password, email } = await createdWithGeneratedPassword();
      const first = (await login(email, password).expect(200)).body;
      const second = (await login(email, password).expect(200)).body; // otra sesión (otro dispositivo)
      const auth = `Bearer ${first.accessToken}`;

      const res = await http()
        .post('/auth/change-password')
        .set('Authorization', auth)
        .send({ currentPassword: password, newPassword: NEW_PASSWORD })
        .expect(200);
      expect(res.body.user.mustChangePassword).toBe(false);

      // Las sesiones viejas dejan de renovarse; la nueva sí.
      await http().post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
      await http().post('/auth/refresh').send({ refreshToken: second.refreshToken }).expect(401);
      await http().post('/auth/refresh').send({ refreshToken: res.body.refreshToken }).expect(200);

      // Con la sesión nueva ya funciona todo; la clave vieja no sirve y la nueva sí.
      await http().get('/users').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200);
      await login(email, password).expect(401);
      const again = await login(email, NEW_PASSWORD).expect(200);
      expect(again.body.user.mustChangePassword).toBe(false);

      const row = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(row.mustChangePassword).toBe(false);
      const audit = await prisma.auditLog.findMany({ where: { action: 'USER_PASSWORD_CHANGED' } });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        actorId: row.id,
        entityId: row.id,
        after: { wasForced: true },
      });
      expect(JSON.stringify(audit)).not.toContain(NEW_PASSWORD);
    });
  });

  it('quien no tiene el flag no se ve afectado y también puede cambiar su clave', async () => {
    const user = await createUser(prisma);
    const auth = await bearer(app, user);
    await http().get('/users').set('Authorization', auth).expect(200);
    const res = await http()
      .post('/auth/change-password')
      .set('Authorization', auth)
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: NEW_PASSWORD })
      .expect(200);
    expect(res.body.user.mustChangePassword).toBe(false);
  });
});
