import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { CheckIn } from '../../generated/prisma/client';
import type { AuthUser } from '../common/types/auth-user';
import { canCheckIn } from '../okrs/domain/policies';
import { objectiveScore } from '../okrs/domain/score';
import { OkrsAccess } from '../okrs/okrs-access.service';
import { okrDomainError } from '../okrs/okrs.errors';
import { PrismaService } from '../prisma/prisma.service';
import { CheckInDto, CreateCheckInDto, PendingCheckInDto } from './dto/check-in.dto';
import { assertCheckInAllowed, evaluateCheckIn } from './domain/check-in';
import { isCheckInOverdue } from './domain/overdue';

const toCheckInDto = (c: CheckIn): CheckInDto => ({
  id: c.id,
  keyResultId: c.keyResultId,
  authorId: c.authorId,
  value: c.value === null ? null : c.value.toString(),
  score: Number(c.score),
  band: c.band,
  action: c.action,
  note: c.note,
  createdAt: c.createdAt,
});

@Injectable()
export class CheckInsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OkrsAccess,
  ) {}

  async create(user: AuthUser, keyResultId: string, dto: CreateCheckInDto): Promise<CheckInDto> {
    const actor = await this.access.loadActor(user);
    const kr = await this.requireKr(keyResultId);
    const objective = await this.access.getVisibleObjective(actor, kr.objectiveId);
    if (!canCheckIn(actor, kr, objective)) {
      throw new ForbiddenException('No podés hacer check-in en este KR');
    }
    const allowed = assertCheckInAllowed({
      objectiveStatus: objective.status,
      cycleStatus: objective.cycle.status,
    });
    if (!allowed.ok) throw okrDomainError(allowed);

    const snapshot = evaluateCheckIn(
      {
        scoring: kr.scoring,
        startValue: kr.startValue === null ? null : Number(kr.startValue),
        targetValue: kr.targetValue === null ? null : Number(kr.targetValue),
      },
      {
        value: dto.value === undefined ? undefined : Number(dto.value),
        manualScore: dto.manualScore,
      },
    );
    if (!snapshot.ok) throw okrDomainError(snapshot);
    const { score, band } = snapshot.value;

    return this.prisma.$transaction(async (tx) => {
      // Mismo lock que altas/ediciones de KRs: serializa el recálculo del score del objetivo.
      await this.access.advisoryLock(tx, `krs:${kr.objectiveId}`);
      const current = await tx.objective.findUniqueOrThrow({
        where: { id: kr.objectiveId },
        select: { status: true, cycle: { select: { status: true } } },
      });
      const stillAllowed = assertCheckInAllowed({
        objectiveStatus: current.status,
        cycleStatus: current.cycle.status,
      });
      if (!stillAllowed.ok) throw okrDomainError(stillAllowed);
      const before = await tx.keyResult.findUniqueOrThrow({ where: { id: keyResultId } });

      const checkIn = await tx.checkIn.create({
        data: {
          keyResultId,
          authorId: actor.id,
          value: dto.value ?? null,
          score,
          band,
          action: dto.action,
          note: dto.note ?? null,
        },
      });
      await tx.keyResult.update({
        where: { id: keyResultId },
        data: {
          score,
          lastCheckInAt: checkIn.createdAt,
          ...(dto.value !== undefined ? { currentValue: dto.value } : {}),
        },
      });
      const krs = await tx.keyResult.findMany({
        where: { objectiveId: kr.objectiveId },
        select: { score: true },
      });
      await tx.objective.update({
        where: { id: kr.objectiveId },
        data: { score: objectiveScore(krs.map((k) => Number(k.score))) },
      });

      if (Number(before.score) !== score) {
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'KR_SCORE_CHANGED',
            entityType: 'KeyResult',
            entityId: keyResultId,
            before: {
              score: Number(before.score),
              value: before.currentValue === null ? null : before.currentValue.toString(),
            },
            after: {
              score,
              value: checkIn.value === null ? null : checkIn.value.toString(),
              checkInId: checkIn.id,
            },
          },
        });
      }
      return toCheckInDto(checkIn);
    });
  }

  async history(user: AuthUser, keyResultId: string): Promise<CheckInDto[]> {
    const actor = await this.access.loadActor(user);
    const kr = await this.requireKr(keyResultId);
    await this.access.getVisibleObjective(actor, kr.objectiveId);
    const rows = await this.prisma.checkIn.findMany({
      where: { keyResultId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toCheckInDto);
  }

  /**
   * KRs vencidos de objetivos publicados: responsable del KR, dueño del objetivo individual o
   * LÍDER del equipo dueño del objetivo (los demás miembros del equipo no, salvo que sean responsables).
   */
  async pending(user: AuthUser): Promise<PendingCheckInDto[]> {
    const now = new Date();
    const krs = await this.prisma.keyResult.findMany({
      where: {
        AND: [
          {
            // Una sola query con OR: cada KR aparece una vez aunque el usuario cumpla varias condiciones.
            OR: [
              { ownerId: user.id },
              { objective: { ownerUserId: user.id } },
              {
                objective: { ownerTeam: { members: { some: { userId: user.id, isLead: true } } } },
              },
            ],
          },
          { objective: { status: 'PUBLISHED', cycle: { status: { not: 'CLOSED' } } } },
        ],
      },
      include: {
        objective: {
          select: {
            id: true,
            title: true,
            status: true,
            publishedAt: true,
            createdAt: true,
            cycle: { select: { checkInCadence: true } },
          },
        },
      },
      orderBy: [{ lastCheckInAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
    });
    const result: PendingCheckInDto[] = [];
    for (const kr of krs) {
      const { objective } = kr;
      const published = objective.publishedAt ?? objective.createdAt;
      const cadence = objective.cycle.checkInCadence;
      if (!isCheckInOverdue(kr.lastCheckInAt, published, cadence, now, objective.status)) continue;
      result.push({
        keyResultId: kr.id,
        keyResultTitle: kr.title,
        objectiveId: objective.id,
        objectiveTitle: objective.title,
        cadence,
        lastCheckInAt: kr.lastCheckInAt,
        referenceAt: kr.lastCheckInAt ?? published,
      });
    }
    return result;
  }

  private async requireKr(id: string) {
    const kr = await this.prisma.keyResult.findUnique({ where: { id } });
    if (!kr) throw new NotFoundException('KR no encontrado');
    return kr;
  }
}
