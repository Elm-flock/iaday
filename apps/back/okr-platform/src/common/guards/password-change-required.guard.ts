import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ALLOW_PASSWORD_CHANGE_KEY } from '../decorators/allow-password-change.decorator';
import { AuthUser } from '../types/auth-user';

/**
 * Guard global (después de JwtAuthGuard y antes de RolesGuard): si la persona todavía tiene la clave
 * inicial que le dio administración, solo puede cambiarla. Las rutas públicas (login, refresh, logout)
 * no tienen `request.user` y pasan.
 */
@Injectable()
export class PasswordChangeRequiredGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
    if (!user?.mustChangePassword) return true;
    const allowed = this.reflector.getAllAndOverride<boolean | undefined>(
      ALLOW_PASSWORD_CHANGE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (allowed) return true;
    throw new ForbiddenException({
      statusCode: 403,
      message: 'Tenés que cambiar la contraseña inicial antes de seguir.',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  }
}
