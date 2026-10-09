import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { mock, mockDeep } from 'jest-mock-extended';
import { TokenService } from '../../auth/token.service';
import { PrismaService } from '../../prisma/prisma.service';
import { makeContext } from '../../../test/helpers/make-context';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const tokens = mock<TokenService>();
  const prisma = mockDeep<PrismaService>();
  const guard = new JwtAuthGuard(new Reflector(), tokens, prisma);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('deja pasar rutas @Public sin token ni consulta a BD', async () => {
    const ctx = makeContext({ headers: {} }, { isPublic: true });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('sin header Authorization -> 401', async () => {
    await expect(guard.canActivate(makeContext({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('esquema distinto de Bearer -> 401', async () => {
    const ctx = makeContext({ headers: { authorization: 'Basic abc' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('token inválido -> 401', async () => {
    tokens.verifyAccess.mockRejectedValue(new UnauthorizedException());
    const ctx = makeContext({ headers: { authorization: 'Bearer malo' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('usuario inexistente -> 401', async () => {
    tokens.verifyAccess.mockResolvedValue({ sub: 'u1', role: 'MEMBER' });
    prisma.user.findUnique.mockResolvedValue(null);
    const ctx = makeContext({ headers: { authorization: 'Bearer ok' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('usuario desactivado -> 401 inmediato (lookup en BD por request)', async () => {
    tokens.verifyAccess.mockResolvedValue({ sub: 'u1', role: 'MEMBER' });
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'MEMBER', active: false } as never);
    const ctx = makeContext({ headers: { authorization: 'Bearer ok' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' } }),
    );
  });

  it('usuario activo -> adjunta request.user con el rol VIGENTE en BD (no el del token)', async () => {
    tokens.verifyAccess.mockResolvedValue({ sub: 'u1', role: 'ADMIN' });
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'MEMBER', active: true } as never);
    const req: Record<string, unknown> = { headers: { authorization: 'Bearer ok' } };
    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(req.user).toEqual({ id: 'u1', role: 'MEMBER' });
  });
});
