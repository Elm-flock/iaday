import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Feedback, Prisma } from '../../../generated/prisma/client';
import type { AuthUser } from '../../common/types/auth-user';
import { OkrsAccess } from '../../okrs/okrs-access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { cfrDomainError } from '../cfr.errors';
import { canModifyFeedback } from './domain/privacy';
import { CreateFeedbackDto, FeedbackBox, FeedbackDto, UpdateFeedbackDto } from './dto/feedback.dto';

const toDto = (f: Feedback): FeedbackDto => ({
  id: f.id,
  fromUserId: f.fromUserId,
  toUserId: f.toUserId,
  content: f.content,
  objectiveId: f.objectiveId,
  keyResultId: f.keyResultId,
  readAt: f.readAt,
  createdAt: f.createdAt,
  editedAt: f.editedAt,
});

/**
 * Feedback PRIVADO: solo emisor y receptor, sin bypass por rol (ni ADMIN ni LEADER).
 * La privacidad se impone en el WHERE de cada consulta (nunca "traer y filtrar"), de modo que
 * un feedback ajeno es indistinguible de uno inexistente (404). No se audita: el contenido
 * jamás debe terminar en AuditLog ni en reportes.
 */
@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OkrsAccess,
  ) {}

  async create(user: AuthUser, dto: CreateFeedbackDto): Promise<FeedbackDto> {
    if (dto.toUserId === user.id) {
      throw cfrDomainError({
        code: 'FEEDBACK_SELF_SEND',
        message: 'No podés enviarte feedback a vos mismo',
      });
    }
    const receiver = await this.prisma.user.findUnique({
      where: { id: dto.toUserId },
      select: { id: true, active: true },
    });
    if (!receiver?.active) throw new NotFoundException('Destinatario no encontrado');
    await this.assertLinksVisible(user, dto);

    const created = await this.prisma.feedback.create({
      data: {
        fromUserId: user.id,
        toUserId: dto.toUserId,
        content: dto.content,
        objectiveId: dto.objectiveId ?? null,
        keyResultId: dto.keyResultId ?? null,
      },
    });
    return toDto(created);
  }

  async list(user: AuthUser, box?: FeedbackBox): Promise<FeedbackDto[]> {
    const where: Prisma.FeedbackWhereInput =
      box === 'received'
        ? { toUserId: user.id }
        : box === 'sent'
          ? { fromUserId: user.id }
          : { OR: [{ fromUserId: user.id }, { toUserId: user.id }] };
    const rows = await this.prisma.feedback.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toDto);
  }

  async get(user: AuthUser, id: string): Promise<FeedbackDto> {
    return toDto(await this.requireVisible(user, id));
  }

  async markRead(user: AuthUser, id: string): Promise<FeedbackDto> {
    const feedback = await this.requireVisible(user, id);
    if (feedback.toUserId !== user.id) {
      throw new ForbiddenException('Solo el destinatario puede marcarlo como leído');
    }
    if (feedback.readAt) return toDto(feedback);
    const updated = await this.prisma.feedback.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return toDto(updated);
  }

  async update(user: AuthUser, id: string, dto: UpdateFeedbackDto): Promise<FeedbackDto> {
    const feedback = await this.requireVisible(user, id);
    if (!canModifyFeedback(user.id, feedback)) {
      throw new ForbiddenException('Solo el autor puede editar el feedback');
    }
    const updated = await this.prisma.feedback.update({
      where: { id },
      data: { content: dto.content, editedAt: new Date() },
    });
    return toDto(updated);
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const feedback = await this.requireVisible(user, id);
    if (!canModifyFeedback(user.id, feedback)) {
      throw new ForbiddenException('Solo el autor puede borrar el feedback');
    }
    await this.prisma.feedback.delete({ where: { id } });
  }

  /** Privacidad en la query misma: emisor o receptor; cualquier otro -> 404. */
  private async requireVisible(user: AuthUser, id: string): Promise<Feedback> {
    const feedback = await this.prisma.feedback.findFirst({
      where: { id, OR: [{ fromUserId: user.id }, { toUserId: user.id }] },
    });
    if (!feedback) throw new NotFoundException('Feedback no encontrado');
    return feedback;
  }

  /** El objetivo/KR enlazado debe ser visible para el emisor (un DRAFT ajeno no revela su existencia). */
  private async assertLinksVisible(user: AuthUser, dto: CreateFeedbackDto): Promise<void> {
    if (!dto.objectiveId && !dto.keyResultId) return;
    const actor = await this.access.loadActor(user);
    if (dto.keyResultId) {
      const kr = await this.prisma.keyResult.findUnique({
        where: { id: dto.keyResultId },
        select: { objectiveId: true },
      });
      if (!kr) throw new NotFoundException('KR no encontrado');
      if (dto.objectiveId && dto.objectiveId !== kr.objectiveId) {
        throw new BadRequestException('El KR no pertenece al objetivo indicado');
      }
      await this.access.getVisibleObjective(actor, kr.objectiveId);
    } else if (dto.objectiveId) {
      await this.access.getVisibleObjective(actor, dto.objectiveId);
    }
  }
}
