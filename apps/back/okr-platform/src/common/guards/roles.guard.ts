import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthUser, Role } from '../types/auth-user';

/** Guard global: si la ruta declara @Roles, exige que el usuario tenga uno de ellos. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const user = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
    if (!user || !roles.includes(user.role)) throw new ForbiddenException('Rol insuficiente');
    return true;
  }
}
