import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { canViewObjective, type Actor } from './domain/policies';

export const OBJECTIVE_INCLUDE = {
  keyResults: { orderBy: { position: 'asc' } },
  cycle: { select: { status: true } },
} satisfies Prisma.ObjectiveInclude;

export type ObjectiveRecord = Prisma.ObjectiveGetPayload<{ include: typeof OBJECTIVE_INCLUDE }>;

/** Carga del actor y de objetivos respetando la visibilidad (compartido por objetivos y KRs). */
@Injectable()
export class OkrsAccess {
  constructor(private readonly prisma: PrismaService) {}

  async loadActor(user: AuthUser): Promise<Actor> {
    const memberships = await this.prisma.teamMember.findMany({
      where: { userId: user.id },
      select: { teamId: true, isLead: true },
    });
    return { id: user.id, role: user.role, teams: memberships };
  }

  /** 404 si no existe o el actor no puede verlo (un DRAFT ajeno no revela su existencia). */
  async getVisibleObjective(actor: Actor, id: string): Promise<ObjectiveRecord> {
    const objective = await this.prisma.objective.findUnique({
      where: { id },
      include: OBJECTIVE_INCLUDE,
    });
    if (!objective || !canViewObjective(actor, objective)) {
      throw new NotFoundException('Objetivo no encontrado');
    }
    return objective;
  }

  /** Lock de aplicación (se libera al terminar la transacción) para serializar conteos y altas. */
  async advisoryLock(tx: Prisma.TransactionClient, key: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
}
