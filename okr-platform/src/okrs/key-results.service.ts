import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { canAddKeyResult } from './domain/limits';
import { decimalEquals, validateKrDefinition } from './domain/key-result';
import { canEditKrTargetAfterPublish, canEditObjective } from './domain/policies';
import { krScore, objectiveScore } from './domain/score';
import { KeyResultDto } from './dto/key-result.dto';
import { CreateKeyResultDto, UpdateKeyResultDto } from './dto/key-result-input.dto';
import { OkrsAccess, type ObjectiveRecord } from './okrs-access.service';
import { okrDomainError } from './okrs.errors';
import { toKeyResultDto } from './okrs.mapper';

const decimalString = (value: string): string => new Prisma.Decimal(value).toString();

@Injectable()
export class KeyResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OkrsAccess,
  ) {}

  async create(
    user: AuthUser,
    objectiveId: string,
    dto: CreateKeyResultDto,
  ): Promise<KeyResultDto> {
    const actor = await this.access.loadActor(user);
    const objective = await this.access.getVisibleObjective(actor, objectiveId);
    if (!canEditObjective(actor, objective)) {
      throw new ForbiddenException('No podés modificar este objetivo');
    }
    this.assertOpen(objective);

    const definition = validateKrDefinition({
      scoring: dto.scoring,
      start: dto.startValue,
      target: dto.targetValue,
    });
    if (!definition.ok) throw okrDomainError(definition);
    await this.requireUser(dto.ownerId);

    return this.prisma.$transaction(async (tx) => {
      await this.access.advisoryLock(tx, `krs:${objectiveId}`);
      await this.assertStillOpen(tx, objectiveId);
      const existing = await tx.keyResult.findMany({
        where: { objectiveId },
        select: { position: true },
      });
      const limit = canAddKeyResult(existing.length);
      if (!limit.ok) throw okrDomainError(limit);

      const created = await tx.keyResult.create({
        data: {
          objectiveId,
          ownerId: dto.ownerId,
          title: dto.title,
          scoring: dto.scoring,
          unit: dto.unit ?? null,
          startValue: dto.startValue ?? null,
          targetValue: dto.targetValue ?? null,
          // El valor actual parte del inicial (score 0) hasta el primer check-in.
          currentValue: dto.scoring === 'DERIVED' ? dto.startValue : null,
          position: existing.reduce((max, k) => Math.max(max, k.position), 0) + 1,
        },
      });
      await this.recomputeObjectiveScore(tx, objectiveId);
      return toKeyResultDto(created);
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateKeyResultDto): Promise<KeyResultDto> {
    const actor = await this.access.loadActor(user);
    const kr = await this.requireKr(id);
    const objective = await this.access.getVisibleObjective(actor, kr.objectiveId);

    const startChanged =
      dto.startValue !== undefined &&
      (kr.startValue === null || !decimalEquals(kr.startValue.toString(), dto.startValue));
    const targetChanged =
      dto.targetValue !== undefined &&
      (kr.targetValue === null || !decimalEquals(kr.targetValue.toString(), dto.targetValue));
    const targetFieldsChanged = startChanged || targetChanged;
    const targetFieldsProvided = dto.startValue !== undefined || dto.targetValue !== undefined;
    const otherProvided =
      dto.title !== undefined || dto.ownerId !== undefined || dto.unit !== undefined;

    // Tras publicar, cambiar start/target es una decisión del líder/ADMIN (y queda auditada);
    // el resto de los campos los edita quien edita el objetivo.
    const targetPolicy = objective.status === 'PUBLISHED' && targetFieldsChanged;
    if (targetPolicy) {
      const ownerTeamIds = await this.ownerUserTeamIds(objective);
      if (!canEditKrTargetAfterPublish(actor, objective, ownerTeamIds)) {
        throw new ForbiddenException('Solo un líder o ADMIN puede cambiar la meta tras publicar');
      }
    }
    if (
      (otherProvided || (targetFieldsProvided && !targetPolicy)) &&
      !canEditObjective(actor, objective)
    ) {
      throw new ForbiddenException('No podés modificar este objetivo');
    }
    this.assertOpen(objective);

    const start = dto.startValue ?? kr.startValue?.toString() ?? null;
    const target = dto.targetValue ?? kr.targetValue?.toString() ?? null;
    const definition = validateKrDefinition({ scoring: kr.scoring, start, target });
    if (!definition.ok) throw okrDomainError(definition);
    if (dto.ownerId) await this.requireUser(dto.ownerId);

    return this.prisma.$transaction(async (tx) => {
      await this.access.advisoryLock(tx, `krs:${kr.objectiveId}`);
      await this.assertStillOpen(tx, kr.objectiveId);

      const data: Prisma.KeyResultUncheckedUpdateInput = {
        title: dto.title,
        ownerId: dto.ownerId,
        unit: dto.unit,
      };
      if (targetFieldsChanged) {
        data.startValue = start;
        data.targetValue = target;
        const current = kr.currentValue === null ? null : Number(kr.currentValue);
        // En DRAFT no hay check-ins: si el valor actual era el inicial, sigue al nuevo inicial.
        const followsStart =
          objective.status === 'DRAFT' &&
          startChanged &&
          kr.currentValue !== null &&
          kr.startValue !== null &&
          decimalEquals(kr.currentValue.toString(), kr.startValue.toString());
        const newCurrent = followsStart ? Number(start) : current;
        if (followsStart) data.currentValue = start;
        data.score =
          kr.scoring === 'DERIVED' && newCurrent !== null
            ? krScore({
                scoring: 'DERIVED',
                start: Number(start),
                target: Number(target),
                current: newCurrent,
              })
            : kr.score;
      }
      const updated = await tx.keyResult.update({ where: { id }, data });

      if (targetPolicy) {
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'KR_TARGET_CHANGED',
            entityType: 'KeyResult',
            entityId: id,
            before: {
              startValue: kr.startValue?.toString() ?? null,
              targetValue: kr.targetValue?.toString() ?? null,
              score: Number(kr.score),
            },
            after: {
              startValue: start === null ? null : decimalString(start),
              targetValue: target === null ? null : decimalString(target),
              score: Number(updated.score),
            },
          },
        });
      }
      if (targetFieldsChanged) await this.recomputeObjectiveScore(tx, kr.objectiveId);
      return toKeyResultDto(updated);
    });
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const actor = await this.access.loadActor(user);
    const kr = await this.requireKr(id);
    const objective = await this.access.getVisibleObjective(actor, kr.objectiveId);
    if (!canEditObjective(actor, objective)) {
      throw new ForbiddenException('No podés modificar este objetivo');
    }
    if (objective.cycle.status === 'CLOSED') {
      throw okrDomainError({ code: 'CYCLE_CLOSED', message: 'El ciclo está cerrado' });
    }
    if (objective.status !== 'DRAFT') {
      throw okrDomainError({
        code: 'OBJECTIVE_NOT_DRAFT',
        message: 'Solo se pueden borrar KRs de objetivos en DRAFT',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await this.access.advisoryLock(tx, `krs:${kr.objectiveId}`);
      const current = await tx.objective.findUniqueOrThrow({
        where: { id: kr.objectiveId },
        select: { status: true },
      });
      if (current.status !== 'DRAFT') {
        throw okrDomainError({
          code: 'OBJECTIVE_NOT_DRAFT',
          message: 'Solo se pueden borrar KRs de objetivos en DRAFT',
        });
      }
      await tx.keyResult.deleteMany({ where: { id } });
      await this.recomputeObjectiveScore(tx, kr.objectiveId);
    });
  }

  /** Objetivo cerrado o ciclo cerrado: no admite cambios de KRs (409). */
  private assertOpen(objective: ObjectiveRecord): void {
    if (objective.status === 'CLOSED') {
      throw okrDomainError({ code: 'OBJECTIVE_CLOSED', message: 'El objetivo está cerrado' });
    }
    if (objective.cycle.status === 'CLOSED') {
      throw okrDomainError({ code: 'CYCLE_CLOSED', message: 'El ciclo está cerrado' });
    }
  }

  /** Re-chequeo dentro de la transacción: el cierre de ciclo pudo ocurrir tras la lectura. */
  private async assertStillOpen(tx: Prisma.TransactionClient, objectiveId: string) {
    const current = await tx.objective.findUniqueOrThrow({
      where: { id: objectiveId },
      select: { status: true },
    });
    if (current.status === 'CLOSED') {
      throw okrDomainError({ code: 'OBJECTIVE_CLOSED', message: 'El objetivo está cerrado' });
    }
  }

  private async recomputeObjectiveScore(tx: Prisma.TransactionClient, objectiveId: string) {
    const krs = await tx.keyResult.findMany({ where: { objectiveId }, select: { score: true } });
    await tx.objective.update({
      where: { id: objectiveId },
      data: { score: objectiveScore(krs.map((k) => Number(k.score))) },
    });
  }

  private async ownerUserTeamIds(objective: ObjectiveRecord): Promise<string[]> {
    if (!objective.ownerUserId) return [];
    const memberships = await this.prisma.teamMember.findMany({
      where: { userId: objective.ownerUserId },
      select: { teamId: true },
    });
    return memberships.map((m) => m.teamId);
  }

  private async requireKr(id: string) {
    const kr = await this.prisma.keyResult.findUnique({ where: { id } });
    if (!kr) throw new NotFoundException('KR no encontrado');
    return kr;
  }

  private async requireUser(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw new NotFoundException('Usuario responsable no encontrado');
  }
}
