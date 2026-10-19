import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type AdaptedContent, type AiSuggestion } from '../../generated/prisma/client';
import { canEditObjective, canCreateObjectiveFor } from '../okrs/domain/policies';
import type { Actor } from '../okrs/domain/policies';
import { OkrsAccess, type ObjectiveRecord } from '../okrs/okrs-access.service';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import type { AdaptLevel, ReviewReason, Segment } from './agent-contract.types';
import type { AgentFailure } from './ai.client';
import { AiClient } from './ai.client';
import { AiConfig } from './ai.config';
import { aiDisabledError, aiDomainError, mapAgentFailure } from './ai.errors';
import {
  acceptTransition,
  validateEditedSegments,
  validateTransition,
} from './domain/adaptation-state';
import { canAdapt, canDecide, canValidateAdaptation } from './domain/access';
import {
  checkInSegments,
  feedbackSegments,
  krSummaryInput,
  mustPreserveFromKrs,
  objectiveSegments,
  okrSuggestInput,
} from './domain/minimize';
import { currentPromptFor, decideAdaptationCache } from './domain/adaptation-cache';
import { sourceHash } from './domain/source-hash';
import { toLlmCallRows, toTransportFailureRow, type UsageContext } from './domain/usage-mapper';
import { type AdaptedContentDto, type ValidateAdaptationDto } from './dto/adapt.dto';
import type { AiSuggestionDto, DraftObjectiveDto, OkrSuggestDto } from './dto/suggestion.dto';

export type AdaptableType = 'OBJECTIVE' | 'CHECK_IN' | 'FEEDBACK';

interface ResolvedTarget {
  entityType: AdaptableType;
  entityId: string;
  segments: Segment[];
  mustPreserve: string[];
  /** Objetivo visible asociado (null para feedback). */
  objective: ObjectiveRecord | null;
}

const json = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;
const decimalStr = (d: Prisma.Decimal | null): string | null => (d === null ? null : d.toString());

/**
 * Orquesta la IA: permisos y minimización (acá), generación (agente, sin BD) y persistencia
 * (acá, el ÚNICO que escribe). Cada pedido guarda LlmCall por intento aun cuando el agente falla.
 */
@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OkrsAccess,
    private readonly client: AiClient,
    private readonly config: AiConfig,
  ) {}

  status(): { enabled: boolean } {
    return { enabled: this.config.enabled };
  }

  // ---------------------------------------------------------------- adaptación

  async adapt(
    user: AuthUser,
    entityType: AdaptableType,
    entityId: string,
    level: AdaptLevel,
  ): Promise<AdaptedContentDto> {
    this.assertEnabled();
    const actor = await this.access.loadActor(user);
    const target = await this.resolveTarget(actor, entityType, entityId);
    if (target.segments.length === 0) {
      throw aiDomainError({
        code: 'AI_NOTHING_TO_ADAPT',
        message: 'No hay texto para adaptar en este elemento',
      });
    }
    const hash = sourceHash(target.segments, level);
    const cached = await this.findAdaptation(entityType, entityId, level, hash);
    if (cached && (await this.isServable(cached, level))) return this.toAdaptedDto(cached, true);

    const traceId = randomUUID();
    const startedAt = Date.now();
    const usageCtx: UsageContext = {
      traceId,
      feature: 'ADAPT',
      actorId: actor.id,
      entityType,
      entityId,
    };
    const outcome = await this.client.adapt(
      {
        level,
        entityType,
        locale: 'es',
        segments: target.segments,
        ...(target.mustPreserve.length ? { mustPreserve: target.mustPreserve } : {}),
      },
      traceId,
    );
    if (!outcome.ok) return this.failWith(outcome.failure, usageCtx);

    const data = outcome.data;
    if (!isAdaptResult(data, target.segments)) {
      await this.persistCalls(data.usage ?? [], usageCtx);
      throw mapAgentFailure({ code: 'AI_OUTPUT_INVALID' });
    }
    const status = data.needsHumanReview ? 'NEEDS_REVIEW' : 'DRAFT';
    const generated = {
      content: json({ segments: data.result.segments, glossary: data.result.glossary ?? [] }),
      readability: json(data.readability),
      status,
      reviewReason: data.reviewReason ?? null,
      promptId: data.prompt.id,
      promptVersion: data.prompt.version,
      traceId,
      generationMs: Date.now() - startedAt,
      requestedById: actor.id,
    } as const;
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        await tx.llmCall.createMany({ data: toLlmCallRows(data.usage, usageCtx) });
        let row: AdaptedContent;
        if (cached) {
          // Fila vencida (prompt viejo): se reemplaza EN el lugar (la clave es solo texto fuente).
          // La guarda de estado evita pisar una fila que se aceptó/validó mientras se generaba.
          const res = await tx.adaptedContent.updateMany({
            where: { id: cached.id, status: { in: ['DRAFT', 'NEEDS_REVIEW'] } },
            data: generated,
          });
          if (res.count === 0) throw new StaleRowRaceError();
          row = await tx.adaptedContent.findUniqueOrThrow({ where: { id: cached.id } });
        } else {
          row = await tx.adaptedContent.create({
            data: { entityType, entityId, level, sourceHash: hash, ...generated },
          });
        }
        // Auditoría SIN contenido (ni para feedback): solo referencias y estado.
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'AI_CONTENT_ADAPTED',
            entityType: 'AdaptedContent',
            entityId: row.id,
            ...(cached
              ? {
                  before: json({
                    status: cached.status,
                    promptId: cached.promptId,
                    promptVersion: cached.promptVersion,
                  }),
                }
              : {}),
            after: json({
              adaptedContentId: row.id,
              level,
              status,
              traceId,
              promptVersion: row.promptVersion,
              ...(cached ? { regenerated: true } : {}),
            }),
          },
        });
        return row;
      });
      return this.toAdaptedDto(created, false);
    } catch (error) {
      if (error instanceof StaleRowRaceError) {
        const current = await this.findAdaptation(entityType, entityId, level, hash);
        if (current) return this.toAdaptedDto(current, true);
      }
      // Carrera: otro pedido idéntico guardó primero (unique entityType+entityId+level+sourceHash).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.findAdaptation(entityType, entityId, level, hash);
        if (existing) return this.toAdaptedDto(existing, true);
      }
      throw error;
    }
  }

  async getAdaptation(
    user: AuthUser,
    entityType: AdaptableType,
    entityId: string,
    level: AdaptLevel,
  ): Promise<AdaptedContentDto> {
    const actor = await this.access.loadActor(user);
    const target = await this.resolveTarget(actor, entityType, entityId);
    const hash = sourceHash(target.segments, level);
    const row = await this.findAdaptation(entityType, entityId, level, hash);
    // Una DRAFT/NEEDS_REVIEW de un prompt viejo no se muestra: 404 y el front pide regenerar.
    if (!row || (this.config.enabled && !(await this.isServable(row, level)))) {
      throw aiDomainError({
        code: 'AI_ADAPTATION_NOT_FOUND',
        message: 'Todavía no hay una versión accesible de este elemento',
      });
    }
    return this.toAdaptedDto(row, true);
  }

  async accept(user: AuthUser, adaptedId: string): Promise<AdaptedContentDto> {
    this.assertEnabled();
    const actor = await this.access.loadActor(user);
    const adapted = await this.requireAdapted(adaptedId);
    await this.resolveTarget(actor, asAdaptable(adapted.entityType), adapted.entityId);
    if (!canDecide(actor.id, adapted.requestedById)) {
      throw new ForbiddenException('Solo quien pidió la versión puede aceptarla');
    }
    const next = acceptTransition(adapted.status);
    if (!next.ok) throw aiDomainError(next);
    const res = await this.prisma.adaptedContent.updateMany({
      where: { id: adaptedId, status: 'DRAFT' },
      data: { status: next.value, acceptedAt: new Date() },
    });
    if (res.count === 0) {
      throw aiDomainError({
        code: 'AI_ADAPTATION_STATE_CONFLICT',
        message: 'La versión cambió de estado y no se puede aceptar',
      });
    }
    return this.toAdaptedDto(await this.requireAdapted(adaptedId), false);
  }

  async validate(
    user: AuthUser,
    adaptedId: string,
    dto: ValidateAdaptationDto,
  ): Promise<AdaptedContentDto> {
    this.assertEnabled();
    const actor = await this.access.loadActor(user);
    const adapted = await this.requireAdapted(adaptedId);
    const target = await this.resolveTarget(
      actor,
      asAdaptable(adapted.entityType),
      adapted.entityId,
    );

    const ownerUserId = target.objective?.ownerUserId ?? null;
    const ownerTeamIds = ownerUserId
      ? (
          await this.prisma.teamMember.findMany({
            where: { userId: ownerUserId },
            select: { teamId: true },
          })
        ).map((m) => m.teamId)
      : [];
    const allowed = canValidateAdaptation(
      actor,
      adapted.entityType,
      target.objective,
      ownerTeamIds,
    );
    if (!allowed.ok) {
      if (allowed.code === 'FORBIDDEN') throw new ForbiddenException(allowed.message);
      throw aiDomainError(allowed);
    }
    const next = validateTransition(adapted.status);
    if (!next.ok) throw aiDomainError(next);

    const current = adapted.content as unknown as { segments: Segment[]; glossary: unknown[] };
    let content: Prisma.InputJsonValue | undefined;
    if (dto.content) {
      const check = validateEditedSegments(current.segments, dto.content.segments);
      if (!check.ok) throw aiDomainError(check);
      content = json({
        segments: dto.content.segments,
        glossary: dto.content.glossary ?? current.glossary ?? [],
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const res = await tx.adaptedContent.updateMany({
        where: { id: adaptedId, status: { not: 'VALIDATED' } },
        data: {
          status: next.value,
          validatedById: actor.id,
          validatedAt: new Date(),
          validationNote: dto.note ?? null,
          ...(content ? { content, humanEdited: true } : {}),
        },
      });
      if (res.count === 0) {
        throw aiDomainError({
          code: 'AI_ADAPTATION_STATE_CONFLICT',
          message: 'La versión ya fue validada',
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'AI_CONTENT_VALIDATED',
          entityType: 'AdaptedContent',
          entityId: adaptedId,
          before: json({ status: adapted.status }),
          after: json({
            adaptedContentId: adaptedId,
            status: 'VALIDATED',
            humanEdited: Boolean(content) || adapted.humanEdited,
            traceId: adapted.traceId,
          }),
        },
      });
    });
    return this.toAdaptedDto(await this.requireAdapted(adaptedId), false);
  }

  // ------------------------------------------------------------ sugerencia OKR

  async suggestOkr(user: AuthUser, dto: OkrSuggestDto): Promise<AiSuggestionDto> {
    this.assertEnabled();
    const actor = await this.access.loadActor(user);
    let entityId: string | null = null;
    if (dto.objectiveId) {
      const objective = await this.access.getVisibleObjective(actor, dto.objectiveId);
      if (!canEditObjective(actor, objective)) {
        throw new ForbiddenException('No podés editar este objetivo');
      }
      entityId = objective.id;
    } else {
      if (!dto.ownerUserId === !dto.ownerTeamId) {
        throw new BadRequestException(
          'Informá el objetivo existente o exactamente un owner (usuario o equipo)',
        );
      }
      if (!canCreateObjectiveFor(actor, { userId: dto.ownerUserId, teamId: dto.ownerTeamId })) {
        throw new ForbiddenException('No podés crear objetivos para ese owner');
      }
    }
    const cycle = await this.prisma.cycle.findUnique({
      where: { id: dto.cycleId },
      select: { kind: true },
    });
    if (!cycle) throw new NotFoundException('Ciclo no encontrado');

    const traceId = randomUUID();
    const usageCtx: UsageContext = {
      traceId,
      feature: 'OKR_SUGGEST',
      actorId: actor.id,
      entityType: entityId ? 'OBJECTIVE' : null,
      entityId,
    };
    const outcome = await this.client.okrSuggest(
      okrSuggestInput({
        cycleKind: cycle.kind,
        objective: draftObjective(dto.draft),
        keyResults: dto.draft.keyResults ?? [],
      }),
      traceId,
    );
    if (!outcome.ok) return this.failWith(outcome.failure, usageCtx);
    const data = outcome.data;
    if (!data.result || typeof data.result !== 'object') {
      await this.persistCalls(data.usage ?? [], usageCtx);
      throw mapAgentFailure({ code: 'AI_OUTPUT_INVALID' });
    }
    return this.saveSuggestion(data, usageCtx, {
      feature: 'OKR_SUGGEST',
      entityType: entityId ? 'OBJECTIVE' : null,
      entityId,
    });
  }

  // ------------------------------------------------------- resumen de check-ins

  async summarize(
    user: AuthUser,
    keyResultId: string,
    level: 'STANDARD' | 'PLAIN',
  ): Promise<AiSuggestionDto> {
    this.assertEnabled();
    const actor = await this.access.loadActor(user);
    const kr = await this.prisma.keyResult.findUnique({ where: { id: keyResultId } });
    if (!kr) throw new NotFoundException('KR no encontrado');
    await this.access.getVisibleObjective(actor, kr.objectiveId);
    const rows = await this.prisma.checkIn.findMany({
      where: { keyResultId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 52,
    });
    if (rows.length === 0) {
      throw aiDomainError({
        code: 'AI_NOTHING_TO_SUMMARIZE',
        message: 'Este KR todavía no tiene check-ins para resumir',
      });
    }
    const traceId = randomUUID();
    const usageCtx: UsageContext = {
      traceId,
      feature: 'CHECKIN_SUMMARY',
      actorId: actor.id,
      entityType: 'KEY_RESULT',
      entityId: keyResultId,
    };
    const outcome = await this.client.checkinSummary(
      krSummaryInput(
        {
          title: kr.title,
          scoring: kr.scoring,
          unit: kr.unit,
          startValue: decimalStr(kr.startValue),
          targetValue: decimalStr(kr.targetValue),
          currentValue: decimalStr(kr.currentValue),
        },
        rows.map((c) => ({
          createdAt: c.createdAt,
          value: decimalStr(c.value),
          score: Number(c.score),
          band: c.band,
          action: c.action,
          note: c.note,
        })),
        level,
      ),
      traceId,
    );
    if (!outcome.ok) return this.failWith(outcome.failure, usageCtx);
    const data = outcome.data;
    if (!data.result || typeof data.result !== 'object') {
      await this.persistCalls(data.usage ?? [], usageCtx);
      throw mapAgentFailure({ code: 'AI_OUTPUT_INVALID' });
    }
    return this.saveSuggestion(data, usageCtx, {
      feature: 'CHECKIN_SUMMARY',
      entityType: 'KEY_RESULT',
      entityId: keyResultId,
    });
  }

  async decideSuggestion(
    user: AuthUser,
    id: string,
    decision: 'accept' | 'discard',
  ): Promise<AiSuggestionDto> {
    this.assertEnabled();
    const suggestion = await this.prisma.aiSuggestion.findUnique({ where: { id } });
    // Ajena o inexistente: mismo 404 (una sugerencia es privada de quien la pidió).
    if (!suggestion || !canDecide(user.id, suggestion.requestedById)) {
      throw new NotFoundException('Sugerencia no encontrada');
    }
    if (suggestion.acceptedAt || suggestion.discardedAt) {
      throw aiDomainError({
        code: 'AI_SUGGESTION_ALREADY_DECIDED',
        message: 'Esta sugerencia ya fue aceptada o descartada',
      });
    }
    const now = new Date();
    const timeToDecisionMs = Math.max(0, now.getTime() - suggestion.createdAt.getTime());
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.aiSuggestion.updateMany({
        where: { id, acceptedAt: null, discardedAt: null },
        data:
          decision === 'accept'
            ? { acceptedAt: now, timeToDecisionMs }
            : { discardedAt: now, timeToDecisionMs },
      });
      if (res.count === 0) {
        throw aiDomainError({
          code: 'AI_SUGGESTION_ALREADY_DECIDED',
          message: 'Esta sugerencia ya fue aceptada o descartada',
        });
      }
      if (decision === 'accept') {
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: 'AI_SUGGESTION_ACCEPTED',
            entityType: 'AiSuggestion',
            entityId: id,
            after: json({
              suggestionId: id,
              feature: suggestion.feature,
              traceId: suggestion.traceId,
              timeToDecisionMs,
            }),
          },
        });
      }
    });
    const updated = await this.prisma.aiSuggestion.findUniqueOrThrow({ where: { id } });
    return toSuggestionDto(updated, null);
  }

  // ------------------------------------------------------------------ helpers

  private assertEnabled(): void {
    if (!this.config.enabled) throw aiDisabledError();
  }

  /** Guarda los LlmCall del intento fallido y lanza el error HTTP correspondiente. */
  private async failWith(failure: AgentFailure, ctx: UsageContext): Promise<never> {
    await this.persistCalls(failure.usage, ctx);
    if (failure.transport) {
      await this.prisma.llmCall.create({ data: toTransportFailureRow(failure.transport, ctx) });
    }
    throw mapAgentFailure(failure);
  }

  private async persistCalls(usage: Parameters<typeof toLlmCallRows>[0], ctx: UsageContext) {
    if (usage.length === 0) return;
    await this.prisma.llmCall.createMany({ data: toLlmCallRows(usage, ctx) });
  }

  private async saveSuggestion(
    data: {
      traceId?: string;
      result: unknown;
      needsHumanReview: boolean;
      reviewReason: ReviewReason | null;
      usage: Parameters<typeof toLlmCallRows>[0];
    },
    ctx: UsageContext,
    ref: Pick<AiSuggestion, 'feature' | 'entityType' | 'entityId'>,
  ): Promise<AiSuggestionDto> {
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.llmCall.createMany({ data: toLlmCallRows(data.usage, ctx) });
      return tx.aiSuggestion.create({
        data: {
          feature: ref.feature,
          entityType: ref.entityType,
          entityId: ref.entityId,
          traceId: ctx.traceId,
          payload: json(data.result),
          needsHumanReview: data.needsHumanReview === true,
          requestedById: ctx.actorId,
        },
      });
    });
    return toSuggestionDto(created, data.reviewReason ?? null);
  }

  private findAdaptation(
    entityType: AdaptableType,
    entityId: string,
    level: AdaptLevel,
    hash: string,
  ): Promise<AdaptedContent | null> {
    return this.prisma.adaptedContent.findUnique({
      where: {
        entityType_entityId_level_sourceHash: { entityType, entityId, level, sourceHash: hash },
      },
    });
  }

  /** Aplica la regla de caché (domain/adaptation-cache.ts) con los prompts vigentes del agente. */
  private async isServable(row: AdaptedContent, level: AdaptLevel): Promise<boolean> {
    // VALIDATED/ACCEPTED se sirven siempre: no hace falta consultar al agente.
    if (row.status === 'VALIDATED' || row.status === 'ACCEPTED') return true;
    const current = currentPromptFor(level, await this.client.currentPrompts());
    return decideAdaptationCache(row, current) === 'SERVE';
  }

  private async requireAdapted(id: string): Promise<AdaptedContent> {
    const row = await this.prisma.adaptedContent.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Versión accesible no encontrada');
    return row;
  }

  /**
   * Carga la entidad de origen respetando su visibilidad y arma el payload minimizado.
   * Todo lo que el actor no puede ver responde 404 (el feedback ajeno, también para ADMIN).
   */
  private async resolveTarget(
    actor: Actor,
    entityType: AdaptableType,
    entityId: string,
  ): Promise<ResolvedTarget> {
    if (entityType === 'FEEDBACK') {
      // Privacidad en la query misma (como FeedbackService): ajeno == inexistente.
      const fb = await this.prisma.feedback.findFirst({
        where: { id: entityId, OR: [{ fromUserId: actor.id }, { toUserId: actor.id }] },
      });
      if (!fb || !canAdapt(actor, { type: 'FEEDBACK', ...fb }).ok) {
        throw new NotFoundException('Feedback no encontrado');
      }
      return {
        entityType,
        entityId,
        segments: feedbackSegments(fb),
        mustPreserve: [],
        objective: null,
      };
    }

    if (entityType === 'CHECK_IN') {
      const checkIn = await this.prisma.checkIn.findUnique({
        where: { id: entityId },
        include: { keyResult: true },
      });
      if (!checkIn) throw new NotFoundException('Check-in no encontrado');
      const objective = await this.access.getVisibleObjective(actor, checkIn.keyResult.objectiveId);
      return {
        entityType,
        entityId,
        segments: checkInSegments(checkIn, checkIn.keyResult.title),
        mustPreserve: mustPreserveFromKrs([
          {
            startValue: decimalStr(checkIn.keyResult.startValue),
            targetValue: decimalStr(checkIn.keyResult.targetValue),
          },
        ]),
        objective,
      };
    }

    const objective = await this.access.getVisibleObjective(actor, entityId);
    const krs = objective.keyResults.map((k) => ({
      position: k.position,
      title: k.title,
      unit: k.unit,
      startValue: decimalStr(k.startValue),
      targetValue: decimalStr(k.targetValue),
    }));
    return {
      entityType,
      entityId,
      segments: objectiveSegments({
        title: objective.title,
        description: objective.description,
        keyResults: krs,
      }),
      mustPreserve: mustPreserveFromKrs(krs),
      objective,
    };
  }

  private toAdaptedDto(row: AdaptedContent, cached: boolean): AdaptedContentDto {
    return {
      id: row.id,
      // Las filas de adaptación nunca son de un plan del asistente (AiEntityType se amplió con ASSISTANT_PLAN).
      entityType: row.entityType as AdaptedContentDto['entityType'],
      entityId: row.entityId,
      level: row.level,
      status: row.status,
      reviewReason: row.reviewReason,
      content: row.content as unknown as AdaptedContentDto['content'],
      readability: row.readability as Record<string, unknown>,
      cached,
      traceId: row.traceId,
      generationMs: row.generationMs,
      requestedById: row.requestedById,
      acceptedAt: row.acceptedAt,
      validatedById: row.validatedById,
      validatedAt: row.validatedAt,
      validationNote: row.validationNote,
      humanEdited: row.humanEdited,
      createdAt: row.createdAt,
    };
  }
}

/** Otro pedido aceptó/validó la fila mientras se regeneraba: se sirve la vigente. */
class StaleRowRaceError extends Error {}

function toSuggestionDto(row: AiSuggestion, reviewReason: string | null): AiSuggestionDto {
  return {
    id: row.id,
    feature: row.feature as AiSuggestionDto['feature'],
    traceId: row.traceId,
    payload: row.payload as Record<string, unknown>,
    needsHumanReview: row.needsHumanReview,
    reviewReason,
    acceptedAt: row.acceptedAt,
    discardedAt: row.discardedAt,
    createdAt: row.createdAt,
  };
}

const draftObjective = (d: DraftObjectiveDto) => ({
  title: d.title,
  description: d.description ?? null,
  type: d.type,
});

function asAdaptable(type: string): AdaptableType {
  if (type === 'OBJECTIVE' || type === 'CHECK_IN' || type === 'FEEDBACK') return type;
  throw new NotFoundException('Versión accesible no encontrada');
}

/** La salida del agente conserva claves y orden de los segmentos enviados (contrato §6.2). */
function isAdaptResult(data: { result?: { segments?: unknown } }, sent: Segment[]): boolean {
  const out = data.result?.segments;
  return (
    Array.isArray(out) &&
    out.length === sent.length &&
    out.every(
      (s, i) =>
        typeof s === 'object' &&
        s !== null &&
        (s as Segment).key === sent[i].key &&
        typeof (s as Segment).text === 'string',
    )
  );
}
