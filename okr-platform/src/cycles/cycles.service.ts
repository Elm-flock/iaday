import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Cycle } from '../../generated/prisma/client';
import type { AuthUser } from '../common/types/auth-user';
import { isAchieved } from '../okrs/domain/closure';
import { PrismaService } from '../prisma/prisma.service';
import { cycleDomainError } from './cycles.errors';
import { canTransitionCycle, validateCycleHierarchy, validateThresholds } from './domain/cycles';
import { CreateCycleDto, CycleCloseDto, CycleDto, UpdateCycleDto } from './dto/cycle.dto';

const DEFAULT_COMMITTED = 1;
const DEFAULT_ASPIRATIONAL = 0.7;

const toDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const toIso = (d: Date): string => d.toISOString().slice(0, 10);

function toDto(c: Cycle): CycleDto {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    parentId: c.parentId,
    startDate: toIso(c.startDate),
    endDate: toIso(c.endDate),
    status: c.status,
    checkInCadence: c.checkInCadence,
    committedThreshold: Number(c.committedThreshold),
    aspirationalThreshold: Number(c.aspirationalThreshold),
    closedAt: c.closedAt,
  };
}

@Injectable()
export class CyclesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<CycleDto[]> {
    const cycles = await this.prisma.cycle.findMany({
      orderBy: [{ startDate: 'asc' }, { name: 'asc' }],
    });
    return cycles.map(toDto);
  }

  async get(id: string): Promise<CycleDto> {
    return toDto(await this.require(id));
  }

  async create(dto: CreateCycleDto): Promise<CycleDto> {
    const start = toDate(dto.startDate);
    const end = toDate(dto.endDate);
    const parent = dto.parentId
      ? await this.require(dto.parentId, 'Ciclo padre no encontrado')
      : null;
    const siblings = parent ? await this.siblingQuarters(parent.id) : [];

    const hierarchy = validateCycleHierarchy(
      { kind: dto.kind, start, end },
      parent ? { kind: parent.kind, start: parent.startDate, end: parent.endDate } : undefined,
      siblings,
    );
    if (!hierarchy.ok) throw cycleDomainError(hierarchy);

    const committed = dto.committedThreshold ?? DEFAULT_COMMITTED;
    const aspirational = dto.aspirationalThreshold ?? DEFAULT_ASPIRATIONAL;
    const thresholds = validateThresholds({ committed, aspirational });
    if (!thresholds.ok) throw cycleDomainError(thresholds);

    const created = await this.prisma.cycle.create({
      data: {
        name: dto.name,
        kind: dto.kind,
        parentId: parent?.id ?? null,
        startDate: start,
        endDate: end,
        checkInCadence: dto.checkInCadence,
        committedThreshold: committed,
        aspirationalThreshold: aspirational,
      },
    });
    return toDto(created);
  }

  async update(actor: AuthUser, id: string, dto: UpdateCycleDto): Promise<CycleDto> {
    const cycle = await this.require(id);
    if (cycle.status === 'CLOSED') throw new ConflictException('El ciclo está cerrado');

    const datesChanged = dto.startDate !== undefined || dto.endDate !== undefined;
    if (datesChanged && cycle.status !== 'DRAFT') {
      throw new ConflictException('Las fechas solo se pueden editar en ciclos DRAFT');
    }
    const start = dto.startDate ? toDate(dto.startDate) : cycle.startDate;
    const end = dto.endDate ? toDate(dto.endDate) : cycle.endDate;
    if (datesChanged) await this.assertDatesFit(cycle, start, end);

    const committed = dto.committedThreshold ?? Number(cycle.committedThreshold);
    const aspirational = dto.aspirationalThreshold ?? Number(cycle.aspirationalThreshold);
    const thresholds = validateThresholds({ committed, aspirational });
    if (!thresholds.ok) throw cycleDomainError(thresholds);
    const thresholdsChanged =
      committed !== Number(cycle.committedThreshold) ||
      aspirational !== Number(cycle.aspirationalThreshold);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.cycle.update({
        where: { id },
        data: {
          name: dto.name,
          startDate: start,
          endDate: end,
          checkInCadence: dto.checkInCadence,
          committedThreshold: committed,
          aspirationalThreshold: aspirational,
        },
      });
      if (thresholdsChanged) {
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'CYCLE_THRESHOLDS_CHANGED',
            entityType: 'Cycle',
            entityId: id,
            before: {
              committedThreshold: Number(cycle.committedThreshold),
              aspirationalThreshold: Number(cycle.aspirationalThreshold),
            },
            after: { committedThreshold: committed, aspirationalThreshold: aspirational },
          },
        });
      }
      return toDto(updated);
    });
  }

  async activate(actor: AuthUser, id: string): Promise<CycleDto> {
    const cycle = await this.require(id);
    const transition = canTransitionCycle(cycle.status, 'ACTIVE');
    if (!transition.ok) throw cycleDomainError(transition);

    return this.prisma.$transaction(async (tx) => {
      // Condicional: si otro request ya lo activó, count 0 -> transición inválida.
      const { count } = await tx.cycle.updateMany({
        where: { id, status: 'DRAFT' },
        data: { status: 'ACTIVE' },
      });
      if (count === 0) {
        throw cycleDomainError({
          ok: false,
          code: 'INVALID_CYCLE_TRANSITION',
          message: 'El ciclo ya no está en DRAFT',
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'CYCLE_ACTIVATED',
          entityType: 'Cycle',
          entityId: id,
          before: { status: 'DRAFT' },
          after: { status: 'ACTIVE' },
        },
      });
      return toDto(await tx.cycle.findUniqueOrThrow({ where: { id } }));
    });
  }

  /**
   * Cierra el ciclo: cada objetivo PUBLISHED pasa a CLOSED con finalScore (su score vigente) y
   * achieved según el umbral del ciclo AL MOMENTO DEL CIERRE. Los DRAFT no se puntúan ni se cierran.
   */
  async close(actor: AuthUser, id: string): Promise<CycleCloseDto> {
    const cycle = await this.require(id);
    const transition = canTransitionCycle(cycle.status, 'CLOSED');
    if (!transition.ok) throw cycleDomainError(transition);

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      // Primero se toma el lock de la fila del ciclo (UPDATE condicional): un PATCH de umbrales
      // concurrente espera, y los umbrales se leen DESPUÉS, ya vigentes al cierre.
      const { count } = await tx.cycle.updateMany({
        where: { id, status: 'ACTIVE' },
        data: { status: 'CLOSED', closedAt: now },
      });
      if (count === 0) {
        throw cycleDomainError({
          ok: false,
          code: 'INVALID_CYCLE_TRANSITION',
          message: 'El ciclo ya no está ACTIVE',
        });
      }
      const closed = await tx.cycle.findUniqueOrThrow({ where: { id } });
      const thresholds = {
        committed: Number(closed.committedThreshold),
        aspirational: Number(closed.aspirationalThreshold),
      };

      const objectives = await tx.objective.findMany({
        where: { cycleId: id, status: 'PUBLISHED' },
        select: { id: true, type: true, score: true },
        orderBy: { createdAt: 'asc' },
      });
      let achievedObjectives = 0;
      for (const objective of objectives) {
        const finalScore = Number(objective.score);
        const achieved = isAchieved(objective.type, finalScore, thresholds);
        if (achieved) achievedObjectives++;
        await tx.objective.update({
          where: { id: objective.id },
          data: { status: 'CLOSED', closedAt: now, finalScore, achieved },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'OBJECTIVE_CLOSED',
            entityType: 'Objective',
            entityId: objective.id,
            before: { status: 'PUBLISHED' },
            after: { status: 'CLOSED', finalScore, achieved },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'CYCLE_CLOSED',
          entityType: 'Cycle',
          entityId: id,
          before: { status: 'ACTIVE' },
          after: {
            status: 'CLOSED',
            committedThreshold: thresholds.committed,
            aspirationalThreshold: thresholds.aspirational,
            closedObjectives: objectives.length,
            achievedObjectives,
          },
        },
      });
      return { ...toDto(closed), closedObjectives: objectives.length, achievedObjectives };
    });
  }

  /** Las nuevas fechas deben respetar la jerarquía (padre, hermanos) y a los QUARTER hijos. */
  private async assertDatesFit(cycle: Cycle, start: Date, end: Date): Promise<void> {
    const parent = cycle.parentId ? await this.require(cycle.parentId) : null;
    const siblings = parent ? await this.siblingQuarters(parent.id, cycle.id) : [];
    const own = validateCycleHierarchy(
      { kind: cycle.kind, start, end },
      parent ? { kind: parent.kind, start: parent.startDate, end: parent.endDate } : undefined,
      siblings,
    );
    if (!own.ok) throw cycleDomainError(own);

    if (cycle.kind === 'ANNUAL') {
      const children = await this.prisma.cycle.findMany({ where: { parentId: cycle.id } });
      for (const child of children) {
        const fit = validateCycleHierarchy(
          { kind: child.kind, start: child.startDate, end: child.endDate },
          { kind: cycle.kind, start, end },
        );
        if (!fit.ok) throw cycleDomainError(fit);
      }
    }
  }

  private async siblingQuarters(parentId: string, excludeId?: string) {
    const siblings = await this.prisma.cycle.findMany({
      where: { parentId, kind: 'QUARTER', ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { startDate: true, endDate: true },
    });
    return siblings.map((s) => ({ start: s.startDate, end: s.endDate }));
  }

  private async require(id: string, message = 'Ciclo no encontrado'): Promise<Cycle> {
    const cycle = await this.prisma.cycle.findUnique({ where: { id } });
    if (!cycle) throw new NotFoundException(message);
    return cycle;
  }
}
