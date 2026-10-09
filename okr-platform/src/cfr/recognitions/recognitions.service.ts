import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Recognition } from '../../../generated/prisma/client';
import type { AuthUser } from '../../common/types/auth-user';
import { OkrsAccess } from '../../okrs/okrs-access.service';
import { okrDomainError } from '../../okrs/okrs.errors';
import { PrismaService } from '../../prisma/prisma.service';
import { isMilestone } from './domain/milestone';
import {
  CreateRecognitionDto,
  ListRecognitionsQueryDto,
  RecognitionDto,
  RecognitionPageDto,
} from './dto/recognition.dto';

const toDto = (r: Recognition): RecognitionDto => ({
  id: r.id,
  fromUserId: r.fromUserId,
  toUserId: r.toUserId,
  message: r.message,
  objectiveId: r.objectiveId,
  keyResultId: r.keyResultId,
  milestoneVerified: r.milestoneVerified,
  createdAt: r.createdAt,
});

@Injectable()
export class RecognitionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OkrsAccess,
  ) {}

  async create(user: AuthUser, dto: CreateRecognitionDto): Promise<RecognitionDto> {
    if (dto.toUserId === user.id) {
      throw new BadRequestException('No podés reconocerte a vos mismo');
    }
    const receiver = await this.prisma.user.findUnique({
      where: { id: dto.toUserId },
      select: { active: true },
    });
    if (!receiver?.active) throw new NotFoundException('Persona reconocida no encontrada');

    const link = await this.resolveMilestone(user, dto);

    const created = await this.prisma.recognition.create({
      data: {
        fromUserId: user.id,
        toUserId: dto.toUserId,
        message: dto.message,
        objectiveId: link.objectiveId,
        keyResultId: link.keyResultId,
        milestoneVerified: link.verified,
      },
    });
    return toDto(created);
  }

  /** Muro público: cualquier autenticado ve todo; sin agregados por persona. */
  async list(query: ListRecognitionsQueryDto): Promise<RecognitionPageDto> {
    const where: Prisma.RecognitionWhereInput = query.toUserId ? { toUserId: query.toUserId } : {};
    const [total, rows] = await Promise.all([
      this.prisma.recognition.count({ where }),
      this.prisma.recognition.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { items: rows.map(toDto), total, page: query.page, limit: query.limit };
  }

  /**
   * Sin enlace: reconocimiento libre. Con enlace: el objetivo/KR debe ser visible para el
   * emisor y constituir un hito (KR >= 0.7 u objetivo CLOSED, dominio puro); si no, 422.
   */
  private async resolveMilestone(
    user: AuthUser,
    dto: CreateRecognitionDto,
  ): Promise<{ objectiveId: string | null; keyResultId: string | null; verified: boolean }> {
    if (!dto.objectiveId && !dto.keyResultId) {
      return { objectiveId: null, keyResultId: null, verified: false };
    }
    const actor = await this.access.loadActor(user);
    let objectiveId = dto.objectiveId ?? null;
    let kr: { score: number } | null = null;
    if (dto.keyResultId) {
      const row = await this.prisma.keyResult.findUnique({ where: { id: dto.keyResultId } });
      if (!row) throw new NotFoundException('KR no encontrado');
      if (objectiveId && objectiveId !== row.objectiveId) {
        throw new BadRequestException('El KR no pertenece al objetivo indicado');
      }
      objectiveId = row.objectiveId;
      kr = { score: Number(row.score) };
    }
    const objective = await this.access.getVisibleObjective(actor, objectiveId as string);
    if (!isMilestone(kr, { status: objective.status })) {
      throw okrDomainError({
        code: 'MILESTONE_NOT_REACHED',
        message: 'El enlace no es un hito: el KR necesita score >= 0.7 o el objetivo estar CLOSED',
      });
    }
    return { objectiveId, keyResultId: dto.keyResultId ?? null, verified: true };
  }
}
