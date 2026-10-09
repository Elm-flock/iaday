import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { TokenService } from './token.service';

describe('TokenService', () => {
  const jwt = new JwtService({
    secret: 'secreto-de-prueba-0123456789',
    signOptions: { algorithm: 'HS256' },
  });
  const svc = new TokenService(jwt);

  it('firma un access JWT de 15 min y lo verifica', async () => {
    const before = Date.now();
    const { token, expiresAt } = await svc.signAccess({ id: 'u1', role: 'LEADER' });
    expect(token.split('.')).toHaveLength(3);
    expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(15 * 60 * 1000 - 1500);
    expect(expiresAt.getTime() - before).toBeLessThanOrEqual(15 * 60 * 1000 + 1500);
    await expect(svc.verifyAccess(token)).resolves.toMatchObject({ sub: 'u1', role: 'LEADER' });
  });

  it('rechaza un token manipulado', async () => {
    const { token } = await svc.signAccess({ id: 'u1', role: 'ADMIN' });
    await expect(svc.verifyAccess(token + 'x')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza un token firmado con otro secreto', async () => {
    const otro = new JwtService({ secret: 'otro-secreto-distinto-0123456789' });
    const token = await otro.signAsync({ sub: 'u1', role: 'ADMIN' }, { expiresIn: 60 });
    await expect(svc.verifyAccess(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza un token expirado', async () => {
    const token = await jwt.signAsync({ sub: 'u1', role: 'ADMIN' }, { expiresIn: -10 });
    await expect(svc.verifyAccess(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('genera refresh opacos de 32 bytes base64url, únicos', () => {
    const a = svc.generateRefreshToken();
    const b = svc.generateRefreshToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('hashea el refresh con SHA-256 hex determinístico', () => {
    const h = svc.hashRefreshToken('abc');
    expect(h).toBe(createHash('sha256').update('abc').digest('hex'));
  });
});
