import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { truncateAll } from './helpers/db';
import { createTeam, createUser, DEFAULT_PASSWORD } from './helpers/factories';

const DAY = 24 * 60 * 60 * 1000;

describe('Auth (e2e)', () => {
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

  const login = (email: string, password = DEFAULT_PASSWORD) =>
    http().post('/auth/login').send({ email, password });

  const loginOk = async (over: Parameters<typeof createUser>[1] = {}) => {
    const user = await createUser(prisma, over);
    const res = await login(user.email).expect(200);
    return { user, session: res.body as Session };
  };

  interface Session {
    accessToken: string;
    accessExpiresAt: string;
    refreshToken: string;
    refreshExpiresAt: string;
    user: { id: string; email: string; role: string };
  }

  const refresh = (refreshToken: string) => http().post('/auth/refresh').send({ refreshToken });

  describe('POST /auth/login', () => {
    it('credenciales válidas -> 200 con access y refresh (REQ-AUTH-1)', async () => {
      const user = await createUser(prisma, { role: 'LEADER' });
      const res = await login(user.email).expect(200);
      expect(res.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        user: { id: user.id, email: user.email, role: 'LEADER' },
      });
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(res.body.user).not.toHaveProperty('passwordHash');
      // Solo se guarda el hash del refresh
      const rows = await prisma.refreshToken.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].tokenHash).not.toBe(res.body.refreshToken);
    });

    it('email case-insensitive', async () => {
      const user = await createUser(prisma, { email: 'ana@test.local' });
      await login('ANA@Test.Local').expect(200);
      expect(user.id).toBeDefined();
    });

    it('password incorrecto y email inexistente -> 401 idénticos (sin enumeración)', async () => {
      const user = await createUser(prisma);
      const wrongPw = await login(user.email, 'incorrecta').expect(401);
      const noUser = await login('nadie@test.local').expect(401);
      expect(wrongPw.body).toEqual(noUser.body);
      expect(wrongPw.body.message).toBe('Credenciales inválidas');
    });

    it('usuario desactivado -> 401 con el mismo mensaje', async () => {
      const user = await createUser(prisma, { active: false });
      const res = await login(user.email).expect(401);
      expect(res.body.message).toBe('Credenciales inválidas');
    });

    it('body inválido o con campos extra -> 400', async () => {
      await http().post('/auth/login').send({ email: 'no-es-email', password: 'x' }).expect(400);
      await http()
        .post('/auth/login')
        .send({ email: 'a@test.local', password: 'x', role: 'ADMIN' })
        .expect(400);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rota el refresh: devuelve uno nuevo de la misma familia y marca el viejo como reemplazado', async () => {
      const { session } = await loginOk();
      const res = await refresh(session.refreshToken).expect(200);
      expect(res.body.refreshToken).not.toBe(session.refreshToken);
      expect(res.body.accessToken).toEqual(expect.any(String));

      const rows = await prisma.refreshToken.findMany({ orderBy: { createdAt: 'asc' } });
      expect(rows).toHaveLength(2);
      expect(rows[0].familyId).toBe(rows[1].familyId);
      expect(rows[0].replacedAt).not.toBeNull();
      expect(rows[1].replacedAt).toBeNull();

      // el nuevo refresh y el nuevo access funcionan
      await http()
        .get('/auth/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
      await refresh(res.body.refreshToken).expect(200);
    });

    it('token desconocido -> 401', async () => {
      await refresh('no-existe').expect(401);
    });

    it('reuso FUERA de la gracia -> 401, revoca TODA la familia y deja AuditLog', async () => {
      const { user, session } = await loginOk();
      const second = (await refresh(session.refreshToken).expect(200)).body as Session;

      // simula que el reemplazo ocurrió hace 60s (fuera de la gracia de 10s)
      await prisma.refreshToken.updateMany({
        where: { replacedAt: { not: null } },
        data: { replacedAt: new Date(Date.now() - 60_000) },
      });

      await refresh(session.refreshToken).expect(401);

      // el token legítimo más nuevo también quedó inválido
      await refresh(second.refreshToken).expect(401);
      const rows = await prisma.refreshToken.findMany();
      expect(rows.every((r) => r.revokedAt !== null)).toBe(true);

      const audit = await prisma.auditLog.findMany({ where: { action: 'REFRESH_REUSE_DETECTED' } });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ actorId: user.id, entityType: 'User', entityId: user.id });
    });

    it('reuso DENTRO de la gracia (race) -> 401 SIN revocar la familia ni auditar', async () => {
      const { session } = await loginOk();
      const second = (await refresh(session.refreshToken).expect(200)).body as Session;

      await refresh(session.refreshToken).expect(401); // request paralelo perdedor

      const rows = await prisma.refreshToken.findMany();
      expect(rows.every((r) => r.revokedAt === null)).toBe(true);
      expect(await prisma.auditLog.count()).toBe(0);
      // el ganador sigue pudiendo refrescar
      await refresh(second.refreshToken).expect(200);
    });

    it('dos refresh concurrentes con el mismo token: uno gana (200) y el otro 401 sin revocar', async () => {
      const { session } = await loginOk();
      const [a, b] = await Promise.all([
        refresh(session.refreshToken),
        refresh(session.refreshToken),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 401]);
      expect(await prisma.refreshToken.count({ where: { revokedAt: { not: null } } })).toBe(0);
      expect(await prisma.auditLog.count()).toBe(0);
    });

    it('techo de familia de 30 días: familia vencida -> 401', async () => {
      const { session } = await loginOk();
      await prisma.refreshToken.updateMany({
        data: { familyExpiresAt: new Date(Date.now() - 1000) },
      });
      await refresh(session.refreshToken).expect(401);
    });

    it('sliding 7d acotado por el techo: el nuevo refresh no vence después de la familia', async () => {
      const { session } = await loginOk();
      const familyExpiresAt = new Date(Date.now() + 2 * DAY);
      await prisma.refreshToken.updateMany({ data: { familyExpiresAt } });

      await refresh(session.refreshToken).expect(200);

      const fresh = await prisma.refreshToken.findFirstOrThrow({ where: { replacedAt: null } });
      expect(fresh.expiresAt.getTime()).toBe(familyExpiresAt.getTime());
    });

    it('refresh vencido (expiresAt pasado) -> 401', async () => {
      const { session } = await loginOk();
      await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      await refresh(session.refreshToken).expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('revoca la familia: el refresh deja de servir; es idempotente', async () => {
      const { session } = await loginOk();
      await http().post('/auth/logout').send({ refreshToken: session.refreshToken }).expect(204);
      await refresh(session.refreshToken).expect(401);
      await http().post('/auth/logout').send({ refreshToken: 'desconocido' }).expect(204);
    });

    it('replay de un refresh tras logout -> 401 y AuditLog REFRESH_REVOKED_USED (sin REUSE_DETECTED)', async () => {
      const { user, session } = await loginOk();
      await http().post('/auth/logout').send({ refreshToken: session.refreshToken }).expect(204);

      await refresh(session.refreshToken).expect(401);
      await refresh(session.refreshToken).expect(401);

      const used = await prisma.auditLog.findMany({ where: { action: 'REFRESH_REVOKED_USED' } });
      expect(used).toHaveLength(2);
      expect(used[0]).toMatchObject({ actorId: user.id, entityType: 'User', entityId: user.id });
      expect(await prisma.auditLog.count({ where: { action: 'REFRESH_REUSE_DETECTED' } })).toBe(0);
    });
  });

  describe('GET /auth/me', () => {
    it('devuelve el perfil acotado con equipos', async () => {
      const { user, session } = await loginOk({ role: 'LEADER' });
      const team = await createTeam(prisma, { name: 'Plataforma' });
      await prisma.teamMember.create({ data: { userId: user.id, teamId: team.id, isLead: true } });

      const res = await http()
        .get('/auth/me')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);

      expect(res.body).toEqual({
        id: user.id,
        name: user.name,
        email: user.email,
        role: 'LEADER',
        teams: [{ teamId: team.id, name: 'Plataforma', isLead: true }],
      });
    });

    it('sin token -> 401', async () => {
      await http().get('/auth/me').expect(401);
    });
  });

  describe('guards globales', () => {
    it('ruta protegida sin token -> 401; con token válido -> 200', async () => {
      await http().get('/probe/protected').expect(401);
      const { session } = await loginOk();
      await http()
        .get('/probe/protected')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);
    });

    it('token manipulado -> 401', async () => {
      const { session } = await loginOk();
      await http()
        .get('/probe/protected')
        .set('Authorization', `Bearer ${session.accessToken}x`)
        .expect(401);
    });

    it('rol insuficiente -> 403; ADMIN -> 200 (REQ-AUTH-2)', async () => {
      const member = await loginOk({ role: 'MEMBER' });
      await http()
        .get('/probe/admin')
        .set('Authorization', `Bearer ${member.session.accessToken}`)
        .expect(403);
      const admin = await loginOk({ role: 'ADMIN' });
      await http()
        .get('/probe/admin')
        .set('Authorization', `Bearer ${admin.session.accessToken}`)
        .expect(200);
    });

    it('el rol vigente en BD manda sobre el del token (cambio de rol inmediato)', async () => {
      const { user, session } = await loginOk({ role: 'ADMIN' });
      await prisma.user.update({ where: { id: user.id }, data: { role: 'MEMBER' } });
      await http()
        .get('/probe/admin')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(403);
    });

    it('usuario desactivado -> 401 en el siguiente request aunque el access siga vigente', async () => {
      const { user, session } = await loginOk();
      const auth = { Authorization: `Bearer ${session.accessToken}` };
      await http().get('/auth/me').set(auth).expect(200);

      await prisma.user.update({ where: { id: user.id }, data: { active: false } });

      await http().get('/auth/me').set(auth).expect(401);
      await http().get('/probe/protected').set(auth).expect(401);
    });

    it('GET /health sigue siendo público', async () => {
      await http().get('/health').expect(200);
    });
  });

  describe('PrismaExceptionFilter (integración)', () => {
    it('violación de unique (P2002) -> 409', async () => {
      const { session } = await loginOk();
      const res = await http()
        .post('/probe/duplicate-email')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(409);
      expect(res.body.message).not.toMatch(/prisma|email/i);
    });

    it('violación de CHECK de BD (23514) -> 422', async () => {
      const { session } = await loginOk();
      await http()
        .post('/probe/bad-cycle')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(422);
    });
  });
});
