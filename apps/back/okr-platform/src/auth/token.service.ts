import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { Role } from '../common/types/auth-user';
import { ACCESS_TTL_SECONDS } from './auth.constants';

@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  async signAccess(user: { id: string; role: Role }): Promise<{ token: string; expiresAt: Date }> {
    const token = await this.jwt.signAsync(
      { sub: user.id, role: user.role },
      { expiresIn: ACCESS_TTL_SECONDS, algorithm: 'HS256' },
    );
    return { token, expiresAt: new Date(Date.now() + ACCESS_TTL_SECONDS * 1000) };
  }

  async verifyAccess(token: string): Promise<{ sub: string; role: Role }> {
    try {
      return await this.jwt.verifyAsync<{ sub: string; role: Role }>(token, {
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }

  /** Refresh opaco: 32 bytes aleatorios en base64url (alta entropía). */
  generateRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /** SHA-256 hex: suficiente para tokens de alta entropía y permite búsqueda por índice único. */
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
