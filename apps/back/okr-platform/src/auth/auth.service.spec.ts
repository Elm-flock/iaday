import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

const DAY = 24 * 60 * 60 * 1000;

describe('AuthService', () => {
  const prisma = mockDeep<PrismaService>();
  const tokens = new TokenService(new JwtService({ secret: 'secreto-de-prueba-0123456789' }));
  const svc = new AuthService(prisma, tokens);
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await argon2.hash('Correcta123!');
  });

  beforeEach(() => {
    mockReset(prisma);
    prisma.$transaction.mockImplementation(((fn: (tx: unknown) => unknown) => fn(prisma)) as never);
  });

  const user = (over: Record<string, unknown> = {}) =>
    ({
      id: 'u1',
      email: 'ana@test.local',
      name: 'Ana',
      role: 'LEADER',
      active: true,
      passwordHash,
      ...over,
    }) as never;

  describe('login', () => {
    it('credenciales válidas: emite access+refresh y persiste SOLO el hash SHA-256 del refresh', async () => {
      prisma.user.findUnique.mockResolvedValue(user());
      const s = await svc.login('  ANA@Test.Local ', 'Correcta123!');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'ana@test.local' } });
      expect(s.accessToken.split('.')).toHaveLength(3);
      expect(s.user).toEqual({ id: 'u1', name: 'Ana', email: 'ana@test.local', role: 'LEADER' });

      const data = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(data.tokenHash).toBe(tokens.hashRefreshToken(s.refreshToken));
      expect(data.tokenHash).not.toBe(s.refreshToken);
      expect(data.userId).toBe('u1');
      expect(data.familyId).toEqual(expect.any(String));
      const now = Date.now();
      expect(Math.abs((data.expiresAt as Date).getTime() - (now + 7 * DAY))).toBeLessThan(5000);
      expect(Math.abs((data.familyExpiresAt as Date).getTime() - (now + 30 * DAY))).toBeLessThan(
        5000,
      );
    });

    it.each([
      ['password incorrecto', user(), 'otra-clave'],
      ['email inexistente', null, 'Correcta123!'],
      ['usuario desactivado', user({ active: false }), 'Correcta123!'],
    ])(
      '%s -> 401 con el MISMO mensaje (sin enumeración) y sin emitir tokens',
      async (_n, u, pw) => {
        prisma.user.findUnique.mockResolvedValue(u);
        const err = await svc.login('ana@test.local', pw).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(UnauthorizedException);
        expect((err as UnauthorizedException).message).toBe('Credenciales inválidas');
        expect(prisma.refreshToken.create).not.toHaveBeenCalled();
      },
    );
  });

  describe('refresh', () => {
    const rec = (over: Record<string, unknown> = {}) =>
      ({
        id: 'r1',
        userId: 'u1',
        familyId: 'f1',
        revokedAt: null,
        replacedAt: null,
        expiresAt: new Date(Date.now() + 3 * DAY),
        familyExpiresAt: new Date(Date.now() + 20 * DAY),
        ...over,
      }) as never;

    it('token desconocido -> 401', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(svc.refresh('x')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('token expirado -> 401 sin revocar', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        rec({ expiresAt: new Date(Date.now() - 1) }),
      );
      await expect(svc.refresh('x')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('VALID: marca el viejo como reemplazado y emite uno nuevo en la MISMA familia', async () => {
      const familyExpiresAt = new Date(Date.now() + 20 * DAY);
      prisma.refreshToken.findUnique.mockResolvedValue(rec({ familyExpiresAt }));
      prisma.user.findUnique.mockResolvedValue(user());
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const s = await svc.refresh('viejo');

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: tokens.hashRefreshToken('viejo') },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'r1', replacedAt: null, revokedAt: null },
        data: { replacedAt: expect.any(Date) },
      });
      const data = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(data.familyId).toBe('f1');
      expect(data.familyExpiresAt).toEqual(familyExpiresAt);
      expect(data.tokenHash).toBe(tokens.hashRefreshToken(s.refreshToken));
      expect(s.refreshToken).not.toBe('viejo');
    });

    it('techo de familia: el nuevo vence como máximo en familyExpiresAt (sliding 7d con cap)', async () => {
      const familyExpiresAt = new Date(Date.now() + 2 * DAY);
      prisma.refreshToken.findUnique.mockResolvedValue(rec({ familyExpiresAt }));
      prisma.user.findUnique.mockResolvedValue(user());
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      const s = await svc.refresh('viejo');
      expect(s.refreshExpiresAt).toEqual(familyExpiresAt);
    });

    it('carrera en el UPDATE condicional (count 0) -> 401 sin revocar ni emitir', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(rec());
      prisma.user.findUnique.mockResolvedValue(user());
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
      await expect(svc.refresh('x')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('RACE (reemplazado hace 3s): 401 SIN revocar familia ni auditar', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        rec({ replacedAt: new Date(Date.now() - 3000) }),
      );
      await expect(svc.refresh('x')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('REUSED (reemplazado hace 60s): revoca TODA la familia, audita y responde 401', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        rec({ replacedAt: new Date(Date.now() - 60_000) }),
      );
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      await expect(svc.refresh('x')).rejects.toBeInstanceOf(UnauthorizedException);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'f1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'REFRESH_REUSE_DETECTED',
          entityType: 'User',
          entityId: 'u1',
          actorId: 'u1',
        }),
      });
    });

    it('REUSED sobre una familia ya revocada (count 0): 401 y evento REFRESH_REVOKED_USED (no REUSE_DETECTED)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        rec({ revokedAt: new Date(Date.now() - 5000) }),
      );
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(svc.refresh('x')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'REFRESH_REVOKED_USED',
          entityType: 'User',
          entityId: 'u1',
          actorId: 'u1',
          after: { familyId: 'f1' },
        }),
      });
    });

    it('primera detección (count > 0): solo REFRESH_REUSE_DETECTED, sin duplicar con REVOKED_USED', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        rec({ replacedAt: new Date(Date.now() - 60_000) }),
      );
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await expect(svc.refresh('x')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'REFRESH_REUSE_DETECTED' }),
      });
    });

    it('usuario desactivado: 401 y revoca la familia', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(rec());
      prisma.user.findUnique.mockResolvedValue(user({ active: false }));
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      await expect(svc.refresh('x')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'f1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revoca la familia del refresh presentado', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({ familyId: 'f1' } as never);
      await svc.logout('x');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'f1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('token desconocido: idempotente, no falla ni revoca', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(svc.logout('x')).resolves.toBeUndefined();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('me', () => {
    it('devuelve el perfil acotado con equipos', async () => {
      prisma.user.findUnique.mockResolvedValue(
        user({ memberships: [{ teamId: 't1', isLead: true, team: { name: 'Plataforma' } }] }),
      );
      const me = await svc.me('u1');
      expect(me).toEqual({
        id: 'u1',
        name: 'Ana',
        email: 'ana@test.local',
        role: 'LEADER',
        teams: [{ teamId: 't1', name: 'Plataforma', isLead: true }],
      });
      expect(me).not.toHaveProperty('passwordHash');
    });

    it('usuario inexistente -> 401', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(svc.me('u1')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
