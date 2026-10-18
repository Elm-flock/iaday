import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AdaptationRequest, Prisma } from '../../generated/prisma/client';
import type { AuthUser } from '../common/types/auth-user';
import { OkrsAccess } from '../okrs/okrs-access.service';
import type { Actor } from '../okrs/domain/policies';
import { PrismaService } from '../prisma/prisma.service';
import { adaptationDomainError } from './adaptation-requests.errors';
import {
  DEFAULT_DUE_DAYS,
  assignTransition,
  canLinkFeedback,
  computeDueDate,
  deliverTransition,
  isOverdue,
  rejectTransition,
  validateAssignee,
} from './domain/transitions';
import {
  type AdaptationRequestDto,
  type AdaptationRequestPageDto,
  type AssignAdaptationRequestDto,
  type CreateAdaptationRequestDto,
  type DeliverAdaptationRequestDto,
  type ListAdaptationRequestsQueryDto,
  type MyAdaptationRequestsQueryDto,
  type RejectAdaptationRequestDto,
} from './dto/adaptation-request.dto';

const WITH_PEOPLE = {
  requester: { select: { name: true } },
  assignee: { select: { name: true } },
} satisfies Prisma.AdaptationRequestInclude;

type Row = Prisma.AdaptationRequestGetPayload<{ include: typeof WITH_PEOPLE }>;

const OPEN: ('PENDIENTE' | 'EN_CURSO')[] = ['PENDIENTE', 'EN_CURSO'];

/**
 * Pedidos de un documento adaptado a una PERSONA (RD 707/2026 art. 14.5).
 * Privacidad: el AuditLog guarda solo ids y estado (nunca asunto, detalle, notas ni justificación),
 * y administración no recibe el id de un feedback vinculado (no puede leerlo).
 */
@Injectable()
export class AdaptationRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OkrsAccess,
    private readonly config: ConfigService,
  ) {}

  /** Días de plazo configurables (ADAPTATION_DUE_DAYS); inválido -> 10. */
  get dueDays(): number {
    const n = Number(this.config.get<string>('ADAPTATION_DUE_DAYS'));
    return Number.isInteger(n) && n > 0 ? n : DEFAULT_DUE_DAYS;
  }

  async create(user: AuthUser, dto: CreateAdaptationRequestDto): Promise<AdaptationRequestDto> {
    if ((dto.entityType === undefined) !== (dto.entityId === undefined)) {
      throw new BadRequestException('entityType y entityId van juntos o ninguno');
    }
    if (dto.entityType && dto.entityId) {
      await this.assertCanLink(user, dto.entityType, dto.entityId);
    }
    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.adaptationRequest.create({
        data: {
          requesterId: user.id,
          subject: dto.subject.trim(),
          description: dto.description?.trim() || null,
          entityType: dto.entityType ?? null,
          entityId: dto.entityId ?? null,
          preferredFormat: dto.preferredFormat,
          dueDate: computeDueDate(now, this.dueDays),
        },
        include: WITH_PEOPLE,
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'ADAPTATION_REQUEST_CREATED',
          entityType: 'AdaptationRequest',
          entityId: created.id,
          after: { requestId: created.id, status: created.status },
        },
      });
      return created;
    });
    return this.toDto(row, user);
  }

  async listMine(
    user: AuthUser,
    query: MyAdaptationRequestsQueryDto,
  ): Promise<AdaptationRequestPageDto> {
    return this.page({ requesterId: user.id }, query.page, query.limit, user);
  }

  async listAll(
    user: AuthUser,
    query: ListAdaptationRequestsQueryDto,
  ): Promise<AdaptationRequestPageDto> {
    const where: Prisma.AdaptationRequestWhereInput = { status: query.status };
    if (query.overdue !== undefined) {
      const now = new Date();
      const overdue: Prisma.AdaptationRequestWhereInput = {
        status: { in: OPEN },
        dueDate: { lt: now },
      };
      if (query.overdue) Object.assign(where, overdue);
      else where.NOT = overdue;
    }
    return this.page(where, query.page, query.limit, user);
  }

  /** Quien lo pidió o ADMIN; cualquier otra persona recibe 404 (no se revela que existe). */
  async get(user: AuthUser, id: string): Promise<AdaptationRequestDto> {
    const row = await this.requireVisible(user, id);
    return this.toDto(row, user);
  }

  async assign(
    user: AuthUser,
    id: string,
    dto: AssignAdaptationRequestDto,
  ): Promise<AdaptationRequestDto> {
    const row = await this.requireRow(id);
    const next = assignTransition(row.status);
    if (!next.ok) throw adaptationDomainError(next);
    const assignee = await this.prisma.user.findUnique({
      where: { id: dto.assigneeId },
      select: { role: true, active: true },
    });
    const valid = validateAssignee(assignee);
    if (!valid.ok) throw adaptationDomainError(valid);

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.adaptationRequest.updateMany({
        where: { id, status: { in: OPEN } },
        data: { status: next.value, assigneeId: dto.assigneeId },
      });
      if (res.count === 0) throw this.stateConflict();
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'ADAPTATION_REQUEST_ASSIGNED',
          entityType: 'AdaptationRequest',
          entityId: id,
          before: { status: row.status, assigneeId: row.assigneeId },
          after: { status: next.value, assigneeId: dto.assigneeId },
        },
      });
      return tx.adaptationRequest.findUniqueOrThrow({ where: { id }, include: WITH_PEOPLE });
    });
    return this.toDto(updated, user);
  }

  async deliver(
    user: AuthUser,
    id: string,
    dto: DeliverAdaptationRequestDto,
  ): Promise<AdaptationRequestDto> {
    const row = await this.requireRow(id);
    const next = deliverTransition(row.status, dto.resolutionNote);
    if (!next.ok) throw adaptationDomainError(next);

    const updated = await this.prisma.$transaction(async (tx) => {
      const assigneeId = row.assigneeId ?? user.id;
      const res = await tx.adaptationRequest.updateMany({
        where: { id, status: { in: OPEN } },
        data: {
          status: next.value,
          assigneeId,
          resolutionNote: dto.resolutionNote?.trim(),
          resolutionLink: dto.resolutionLink ?? null,
          resolvedAt: new Date(),
        },
      });
      if (res.count === 0) throw this.stateConflict();
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'ADAPTATION_REQUEST_DELIVERED',
          entityType: 'AdaptationRequest',
          entityId: id,
          before: { status: row.status },
          after: { status: next.value, assigneeId },
        },
      });
      return tx.adaptationRequest.findUniqueOrThrow({ where: { id }, include: WITH_PEOPLE });
    });
    return this.toDto(updated, user);
  }

  async reject(
    user: AuthUser,
    id: string,
    dto: RejectAdaptationRequestDto,
  ): Promise<AdaptationRequestDto> {
    const row = await this.requireRow(id);
    const next = rejectTransition(row.status, dto.justification);
    if (!next.ok) throw adaptationDomainError(next);

    const updated = await this.prisma.$transaction(async (tx) => {
      const assigneeId = row.assigneeId ?? user.id;
      const res = await tx.adaptationRequest.updateMany({
        where: { id, status: { in: OPEN } },
        data: {
          status: next.value,
          assigneeId,
          rejectionJustification: dto.justification?.trim(),
          resolvedAt: new Date(),
        },
      });
      if (res.count === 0) throw this.stateConflict();
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'ADAPTATION_REQUEST_REJECTED',
          entityType: 'AdaptationRequest',
          entityId: id,
          before: { status: row.status },
          after: { status: next.value, assigneeId },
        },
      });
      return tx.adaptationRequest.findUniqueOrThrow({ where: { id }, include: WITH_PEOPLE });
    });
    return this.toDto(updated, user);
  }

  // --- internos ---

  private stateConflict() {
    return adaptationDomainError({
      code: 'ADAPTATION_REQUEST_STATE_CONFLICT',
      message: 'El pedido cambió de estado mientras lo modificabas. Recargá y probá de nuevo.',
    });
  }

  private async page(
    where: Prisma.AdaptationRequestWhereInput,
    page: number,
    limit: number,
    viewer: AuthUser,
  ): Promise<AdaptationRequestPageDto> {
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.adaptationRequest.count({ where }),
      this.prisma.adaptationRequest.findMany({
        where,
        include: WITH_PEOPLE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { items: rows.map((r) => this.toDto(r, viewer)), total, page, limit };
  }

  private async requireRow(id: string): Promise<AdaptationRequest> {
    const row = await this.prisma.adaptationRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Pedido no encontrado');
    return row;
  }

  private async requireVisible(user: AuthUser, id: string): Promise<Row> {
    const row = await this.prisma.adaptationRequest.findUnique({
      where: { id },
      include: WITH_PEOPLE,
    });
    if (!row || (user.role !== 'ADMIN' && row.requesterId !== user.id)) {
      throw new NotFoundException('Pedido no encontrado');
    }
    return row;
  }

  /** El vínculo respeta la visibilidad de la entidad: lo que no podés ver responde 404. */
  private async assertCanLink(
    user: AuthUser,
    entityType: 'OBJECTIVE' | 'CHECK_IN' | 'FEEDBACK',
    entityId: string,
  ): Promise<void> {
    if (entityType === 'FEEDBACK') {
      const fb = await this.prisma.feedback.findFirst({
        where: { id: entityId, OR: [{ fromUserId: user.id }, { toUserId: user.id }] },
        select: { fromUserId: true, toUserId: true },
      });
      if (!fb || !canLinkFeedback(user.id, fb))
        throw new NotFoundException('Feedback no encontrado');
      return;
    }
    const actor: Actor = await this.access.loadActor(user);
    if (entityType === 'CHECK_IN') {
      const checkIn = await this.prisma.checkIn.findUnique({
        where: { id: entityId },
        select: { keyResult: { select: { objectiveId: true } } },
      });
      if (!checkIn) throw new NotFoundException('Check-in no encontrado');
      await this.access.getVisibleObjective(actor, checkIn.keyResult.objectiveId);
      return;
    }
    await this.access.getVisibleObjective(actor, entityId);
  }

  private toDto(row: Row, viewer: AuthUser): AdaptationRequestDto {
    // Administración (que no es quien pidió) no recibe el id de un feedback: no puede leerlo.
    const hideLink = row.entityType === 'FEEDBACK' && row.requesterId !== viewer.id;
    return {
      id: row.id,
      requesterId: row.requesterId,
      requesterName: row.requester?.name ?? null,
      subject: row.subject,
      description: row.description,
      entityType:
        row.entityType === 'KEY_RESULT' || row.entityType === 'ASSISTANT_PLAN'
          ? null
          : row.entityType,
      entityId: hideLink ? null : row.entityId,
      preferredFormat: row.preferredFormat,
      status: row.status,
      assigneeId: row.assigneeId,
      assigneeName: row.assignee?.name ?? null,
      dueDate: row.dueDate,
      overdue: isOverdue(row, new Date()),
      resolutionNote: row.resolutionNote,
      resolutionLink: row.resolutionLink,
      rejectionJustification: row.rejectionJustification,
      resolvedAt: row.resolvedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
