import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../common/types/auth-user';
import { AiConfig } from './ai.config';

const WINDOW_MS = 60_000;

/**
 * Límite por USUARIO (no por IP) para los POST/PATCH de /ai: protege el costo de tokens.
 * Ventana deslizante en memoria (una instancia); el límite se lee en cada pedido
 * (`AI_THROTTLE_LIMIT`, default 20/min). Corre después de JwtAuthGuard, así que hay `req.user`.
 */
@Injectable()
export class AiUserThrottlerGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly config: AiConfig) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (req.method !== 'POST' && req.method !== 'PATCH') return true;
    const key = req.user?.id ?? req.ip ?? 'anonymous';
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= this.config.throttleLimit) {
      this.hits.set(key, recent);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Hiciste muchos pedidos de IA seguidos. Probá de nuevo en un minuto.',
          code: 'AI_RATE_LIMITED',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}
