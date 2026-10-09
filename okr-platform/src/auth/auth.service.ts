import { Injectable, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { Role } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { FAMILY_TTL_MS, REFRESH_TTL_MS } from './auth.constants';
import { evaluateRefresh } from './domain/refresh-rotation';
import { TokenService } from './token.service';

export interface AuthSession {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: { id: string; name: string; email: string; role: Role };
}

export interface MeResult {
  id: string;
  name: string;
  email: string;
  role: Role;
  teams: { teamId: string; name: string; isLead: boolean }[];
}

const INVALID_CREDENTIALS = 'Credenciales inválidas';
const INVALID_REFRESH = 'Refresh token inválido';

type SessionUser = { id: string; name: string; email: string; role: Role };

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
      teams: user.memberships.map((m) => ({
        teamId: m.teamId,
        name: m.team.name,
        isLead: m.isLead,
      })),
    };
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
      // Solo se audita la primera detección: re-presentar un token de una familia ya revocada no suma ruido.
      if (count === 0) return;
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'REFRESH_REUSE_DETECTED',
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
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  }
}
