import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { validateAlignment } from './domain/alignment';
import { canCreateObjective, validatePublish } from './domain/limits';
import { validateObjectiveUpdate } from './domain/objective-update';
import { canCreateObjectiveFor, canEditObjective, type Actor } from './domain/policies';
import {
  CreateObjectiveDto,
  ListObjectivesQueryDto,
  ObjectiveDto,
  UpdateObjectiveDto,
} from './dto/objective.dto';
import { OBJECTIVE_INCLUDE, OkrsAccess, type ObjectiveRecord } from './okrs-access.service';
import { okrDomainError } from './okrs.errors';
import { toObjectiveDto } from './okrs.mapper';

/** Estados que cuentan para el límite de 5 y el mínimo de 3 (decisión ronda 3). */
const COUNTED_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
const MAX_ALIGNMENT_DEPTH = 200;

@Injectable()
export class ObjectivesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OkrsAccess,
  ) {}

  async list(user: AuthUser, query: ListObjectivesQueryDto): Promise<ObjectiveDto[]> {
    const actor = await this.access.loadActor(user);
    const where: Prisma.ObjectiveWhereInput = {
      cycleId: query.cycleId,
      ownerTeamId: query.teamId,
      ownerUserId: query.ownerUserId,
      status: query.status,
    };
    if (actor.role !== 'ADMIN') {
      // Misma regla que canViewObjective, resuelta en el WHERE: DRAFT solo para quienes lo editan.
      where.AND = [
        {
          OR: [
            { status: { not: 'DRAFT' } },
            { ownerUserId: actor.id },
            { ownerTeamId: { in: actor.teams.filter((t) => t.isLead).map((t) => t.teamId) } },
          ],
        },
      ];
    }
    const objectives = await this.prisma.objective.findMany({
      where,
      include: OBJECTIVE_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return objectives.map(toObjectiveDto);
  }

  async get(user: AuthUser, id: string): Promise<ObjectiveDto> {
    const actor = await this.access.loadActor(user);
    return toObjectiveDto(await this.access.getVisibleObjective(actor, id));
  }

  async create(user: AuthUser, dto: CreateObjectiveDto): Promise<ObjectiveDto> {
    const actor = await this.access.loadActor(user);
    if (!canCreateObjectiveFor(actor, { userId: dto.ownerUserId, teamId: dto.ownerTeamId })) {
      throw new ForbiddenException('No podés crear objetivos para ese owner');
    }
    const cycle = await this.prisma.cycle.findUnique({
      where: { id: dto.cycleId },
      select: { status: true },
    });
    if (!cycle) throw new NotFoundException('Ciclo no encontrado');
    if (cycle.status === 'CLOSED') {
      throw okrDomainError({ code: 'CYCLE_CLOSED', message: 'El ciclo está cerrado' });
    }
    await this.requireOwner(dto.ownerUserId, dto.ownerTeamId);
    if (dto.parentObjectiveId) await this.checkAlignment(actor, dto.parentObjectiveId);

    const id = await this.prisma.$transaction(async (tx) => {
      await this.lockOwner(tx, dto.cycleId, dto.ownerUserId ?? dto.ownerTeamId!);
      const existing = await tx.objective.count({
        where: {
          cycleId: dto.cycleId,
          ownerUserId: dto.ownerUserId ?? null,
          ownerTeamId: dto.ownerTeamId ?? null,
          status: { in: [...COUNTED_STATUSES] },
        },
      });
      const limit = canCreateObjective(existing);
      if (!limit.ok) throw okrDomainError(limit);
      const created = await tx.objective.create({
        data: {
          cycleId: dto.cycleId,
          ownerUserId: dto.ownerUserId ?? null,
          ownerTeamId: dto.ownerTeamId ?? null,
          parentObjectiveId: dto.parentObjectiveId ?? null,
          title: dto.title,
          description: dto.description ?? null,
          origin: dto.origin,
          type: dto.type,
          createdById: actor.id,
        },
        select: { id: true },
      });
      return created.id;
    });
    return this.get(user, id);
  }

  async update(user: AuthUser, id: string, dto: UpdateObjectiveDto): Promise<ObjectiveDto> {
    const actor = await this.access.loadActor(user);
    const objective = await this.requireEditable(actor, id);

    const changed = Object.entries(dto)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    const verdict = validateObjectiveUpdate(objective.status, changed);
    if (!verdict.ok) throw okrDomainError(verdict);
    if (dto.parentObjectiveId) await this.checkAlignment(actor, dto.parentObjectiveId, id);

    const { count } = await this.prisma.objective.updateMany({
      // Condicionado al estado leído: si lo publicaron/cerraron en el medio, no se pisa.
      where: { id, status: objective.status },
      data: {
        title: dto.title,
        description: dto.description,
        origin: dto.origin,
        type: dto.type,
        parentObjectiveId: dto.parentObjectiveId,
      },
    });
    if (count === 0) {
      throw okrDomainError({
        code: 'OBJECTIVE_FIELD_LOCKED',
        message: 'El objetivo cambió de estado mientras se editaba',
      });
    }
    return this.get(user, id);
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const actor = await this.access.loadActor(user);
    const objective = await this.requireEditable(actor, id);
    if (objective.status !== 'DRAFT') {
      throw okrDomainError({
        code: 'OBJECTIVE_NOT_DRAFT',
        message: 'Solo se pueden borrar objetivos en DRAFT',
      });
    }
    const { count } = await this.prisma.objective.deleteMany({ where: { id, status: 'DRAFT' } });
    if (count === 0) {
      throw okrDomainError({
        code: 'OBJECTIVE_NOT_DRAFT',
        message: 'Solo se pueden borrar objetivos en DRAFT',
      });
    }
  }

  async publish(user: AuthUser, id: string): Promise<ObjectiveDto> {
    const actor = await this.access.loadActor(user);
    const objective = await this.requireEditable(actor, id);
    if (objective.status !== 'DRAFT') {
      throw okrDomainError({
        code: 'OBJECTIVE_NOT_DRAFT',
        message: 'El objetivo ya no está en DRAFT',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // Mismo lock que la creación: el conteo del owner no cambia mientras se valida.
      await this.lockOwner(tx, objective.cycleId, objective.ownerUserId ?? objective.ownerTeamId!);
      const ownerObjectiveCount = await tx.objective.count({
        where: {
          cycleId: objective.cycleId,
          ownerUserId: objective.ownerUserId,
          ownerTeamId: objective.ownerTeamId,
          status: { in: [...COUNTED_STATUSES] },
        },
      });
      // Mismo lock que las altas/bajas de KRs: el conteo de KRs no cambia mientras se valida.
      await this.access.advisoryLock(tx, `krs:${id}`);
      const krCount = await tx.keyResult.count({ where: { objectiveId: id } });
      const verdict = validatePublish({ ownerObjectiveCount, krCount });
      if (!verdict.ok) throw okrDomainError(verdict);

      const { count } = await tx.objective.updateMany({
        where: { id, status: 'DRAFT' },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
      if (count === 0) {
        throw okrDomainError({
          code: 'OBJECTIVE_NOT_DRAFT',
          message: 'El objetivo ya no está en DRAFT',
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'OBJECTIVE_PUBLISHED',
          entityType: 'Objective',
          entityId: id,
          before: { status: 'DRAFT' },
          after: { status: 'PUBLISHED' },
        },
      });
    });
    return this.get(user, id);
  }

  /** Visible (404 si no) + editable (403 si no) + ciclo abierto (409 si cerrado). */
  private async requireEditable(actor: Actor, id: string): Promise<ObjectiveRecord> {
    const objective = await this.access.getVisibleObjective(actor, id);
    if (!canEditObjective(actor, objective)) {
      throw new ForbiddenException('No podés modificar este objetivo');
    }
    if (objective.cycle.status === 'CLOSED') {
      throw okrDomainError({ code: 'CYCLE_CLOSED', message: 'El ciclo está cerrado' });
    }
    return objective;
  }

  private async requireOwner(userId?: string, teamId?: string): Promise<void> {
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) throw new NotFoundException('Usuario owner no encontrado');
    }
    if (teamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true },
      });
      if (!team) throw new NotFoundException('Equipo owner no encontrado');
    }
  }

  /** Valida REQ-ALN-1 cargando la cadena de ancestros del padre (profundidad acotada). */
  private async checkAlignment(
    actor: Actor,
    parentId: string,
    objectiveId?: string,
  ): Promise<void> {
    const parent = await this.access.getVisibleObjective(actor, parentId).catch(() => null);
    if (!parent) throw new NotFoundException('Objetivo padre no encontrado');

    const ancestors: string[] = [];
    let cursor = parent.parentObjectiveId;
    while (cursor && !ancestors.includes(cursor) && ancestors.length < MAX_ALIGNMENT_DEPTH) {
      ancestors.push(cursor);
      const next = await this.prisma.objective.findUnique({
        where: { id: cursor },
        select: { parentObjectiveId: true },
      });
      cursor = next?.parentObjectiveId ?? null;
    }
    const verdict = validateAlignment({
      objectiveId,
      parentId,
      parentStatus: parent.status,
      parentAncestorIds: ancestors,
    });
    if (!verdict.ok) throw okrDomainError(verdict);
  }

  /** Serializa altas/publicaciones del mismo owner en el mismo ciclo (límite 5 / mínimo 3). */
  private lockOwner(tx: Prisma.TransactionClient, cycleId: string, ownerId: string) {
    return this.access.advisoryLock(tx, `objectives:${cycleId}:${ownerId}`);
  }
}
