import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { makeContext } from '../../../test/helpers/make-context';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('sin @Roles deja pasar', () => {
    expect(guard.canActivate(makeContext({ user: { id: 'u', role: 'MEMBER' } }))).toBe(true);
  });

  it('rol permitido -> true', () => {
    const ctx = makeContext({ user: { id: 'u', role: 'ADMIN' } }, { roles: ['ADMIN'] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rol insuficiente -> 403', () => {
    const ctx = makeContext({ user: { id: 'u', role: 'MEMBER' } }, { roles: ['ADMIN', 'LEADER'] });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('@Roles sin usuario en el request (ruta pública mal anotada) -> 403', () => {
    const ctx = makeContext({}, { roles: ['ADMIN'] });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
