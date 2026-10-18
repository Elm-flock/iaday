import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import type { AuthUser } from '../common/types/auth-user';

/**
 * Todas las rutas `/assistant/*` son solo para ADMIN y, para cualquier otra persona, responden 404
 * (no se revela que el asistente existe). Corre después del JwtAuthGuard global, que ya releyó rol y
 * `active` de la base en este pedido.
 */
@Injectable()
export class AssistantAdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
    if (user?.role !== 'ADMIN') throw new NotFoundException();
    return true;
  }
}
