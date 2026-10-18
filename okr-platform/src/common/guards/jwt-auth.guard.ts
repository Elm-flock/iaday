import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { TokenService } from '../../auth/token.service';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthUser } from '../types/auth-user';

/**
 * Guard global: valida el Bearer JWT y consulta el usuario en BD en CADA request (lookup por PK),
 * de modo que desactivar a un usuario o cambiarle el rol surte efecto inmediato.
 * El rol que se adjunta es el vigente en BD, no el del token.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Falta el token Bearer');

    const payload = await this.tokens.verifyAccess(token);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, active: true, mustChangePassword: true },
    });
    if (!user || !user.active) throw new UnauthorizedException('Usuario inexistente o desactivado');

    req.user = { id: user.id, role: user.role, mustChangePassword: user.mustChangePassword };
    return true;
  }
}
