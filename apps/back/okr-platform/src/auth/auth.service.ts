import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { Role } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { FAMILY_TTL_MS, REFRESH_TTL_MS } from './auth.constants';
import { validatePasswordChange } from './domain/password-policy';
import { evaluateRefresh } from './domain/refresh-rotation';
import { TokenService } from './token.service';

export interface AuthSession {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: { id: string; name: string; email: string; role: Role; mustChangePassword: boolean };
}

export interface MeResult {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
  teams: { teamId: string; name: string; isLead: boolean }[];
}

const INVALID_CREDENTIALS = 'Credenciales inválidas';
const INVALID_REFRESH = 'Refresh token inválido';

type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
};

/**
 * Orquesta I/O (Prisma, argon2, JWT). Las decisiones sobre el refresh las toma el dominio
 * (`evaluateRefresh`); acá solo se traducen a efectos.
 */
@Injectable()
export class AuthService {
  /** Hash descartable: permite verificar igual cuando el email no existe (anti timing/enumeración). */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async login(email: string, password: string): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const passwordOk = await argon2.verify(hash, password).catch(() => false);
    if (!user || !passwordOk || !user.active) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const now = new Date();
    return this.issue(
      this.prisma,
      user,
      randomUUID(),
      new Date(now.getTime() + FAMILY_TTL_MS),
      now,
    );
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const now = new Date();
    const rec = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(refreshToken) },
    });

    const verdict = evaluateRefresh(rec, now);
    if (verdict === 'REUSED' && rec) {
      await this.revokeFamilyWithAudit(rec.familyId, rec.userId, now);
      throw new UnauthorizedException(INVALID_REFRESH);
    }
    if (verdict !== 'VALID' || !rec) {
      // UNKNOWN / EXPIRED / RACE: 401 sin efectos (RACE no revoca: requests paralelos legítimos).
      throw new UnauthorizedException(INVALID_REFRESH);
    }

    const user = await this.prisma.user.findUnique({ where: { id: rec.userId } });
    if (!user || !user.active) {
      await this.revokeFamily(this.prisma, rec.familyId, now);
      throw new UnauthorizedException(INVALID_REFRESH);
    }

    return this.prisma.$transaction(async (tx) => {
      // UPDATE condicional: solo uno de los requests concurrentes "gana" la rotación.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: rec.id, replacedAt: null, revokedAt: null },
        data: { replacedAt: now },
      });
      if (count === 0) throw new UnauthorizedException(INVALID_REFRESH);
      return this.issue(tx, user, rec.familyId, rec.familyExpiresAt, now);
    });
  }

  async logout(refreshToken: string): Promise<void> {
    const rec = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(refreshToken) },
      select: { familyId: true },
    });
    if (rec) await this.revokeFamily(this.prisma, rec.familyId, new Date());
  }

  async me(userId: string): Promise<MeResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { include: { team: { select: { name: true } } } } },
    });
    if (!user) throw new UnauthorizedException();
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      teams: user.memberships.map((m) => ({
        teamId: m.teamId,
        name: m.team.name,
        isLead: m.isLead,
      })),
    };
  }

  /**
   * Cambia la clave propia. Exige la actual (aunque haya un JWT válido), apaga `mustChangePassword`,
   * revoca TODAS las familias de refresh (las sesiones viejas dejan de renovarse) y emite una sesión nueva.
   * Nada de la clave se loguea ni se audita: solo queda el hecho del cambio.
   */
  async changePassword(userId: string, current: string, next: string): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new UnauthorizedException();
    const currentOk = await argon2.verify(user.passwordHash, current).catch(() => false);
    if (!currentOk) {
      throw new HttpException(
        {
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          message: 'La contraseña actual no es correcta.',
          code: 'INVALID_CURRENT_PASSWORD',
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const verdict = validatePasswordChange(current, next);
    if (!verdict.ok) {
      throw new HttpException(
        {
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          message: verdict.message,
          code: verdict.code,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const passwordHash = await argon2.hash(next);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false },
      });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'USER_PASSWORD_CHANGED',
          entityType: 'User',
          entityId: userId,
          after: { wasForced: user.mustChangePassword },
        },
      });
      return this.issue(tx, updated, randomUUID(), new Date(now.getTime() + FAMILY_TTL_MS), now);
    });
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= argon2.hash(randomUUID());
    return this.dummyHash;
  }

  private revokeFamily(
    db: Pick<PrismaService, 'refreshToken'>,
    familyId: string,
    now: Date,
  ): Promise<{ count: number }> {
    return db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  private revokeFamilyWithAudit(familyId: string, userId: string, now: Date): Promise<unknown> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await this.revokeFamily(tx, familyId, now);
      // count > 0: primera detección (esta request revocó la familia). count === 0: la familia ya
      // estaba revocada (logout o reuso previo) y se está re-presentando un token -> evento aparte,
      // sin duplicar REFRESH_REUSE_DETECTED.
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: count > 0 ? 'REFRESH_REUSE_DETECTED' : 'REFRESH_REVOKED_USED',
          entityType: 'User',
          entityId: userId,
          after: { familyId },
        },
      });
    });
  }

  private async issue(
    db: Pick<PrismaService, 'refreshToken'>,
    user: SessionUser,
    familyId: string,
    familyExpiresAt: Date,
    now: Date,
  ): Promise<AuthSession> {
    const access = await this.tokens.signAccess({ id: user.id, role: user.role });
    const refreshToken = this.tokens.generateRefreshToken();
    // Deslizante 7 días, nunca más allá del techo absoluto de la familia.
    const refreshExpiresAt = new Date(
      Math.min(now.getTime() + REFRESH_TTL_MS, familyExpiresAt.getTime()),
    );
    await db.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: this.tokens.hashRefreshToken(refreshToken),
        expiresAt: refreshExpiresAt,
        familyExpiresAt,
      },
    });
    return {
      accessToken: access.token,
      accessExpiresAt: access.expiresAt,
      refreshToken,
      refreshExpiresAt,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }
}
