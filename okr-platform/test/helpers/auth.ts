import { INestApplication } from '@nestjs/common';
import { TokenService } from '../../src/auth/token.service';

/** Header Authorization válido para un usuario existente (firma el access token directamente). */
export async function bearer(
  app: INestApplication,
  user: { id: string; role: 'ADMIN' | 'LEADER' | 'MEMBER' },
): Promise<string> {
  const { token } = await app.get(TokenService).signAccess({ id: user.id, role: user.role });
  return `Bearer ${token}`;
}
