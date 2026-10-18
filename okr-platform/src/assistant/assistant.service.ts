import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AssistantMessage, AssistantPlan, Prisma } from '../../generated/prisma/client';
import { AiClient } from '../ai/ai.client';
import { aiDisabledError, aiDomainError, mapAgentFailure } from '../ai/ai.errors';
import { AiConfig } from '../ai/ai.config';
import type { UsageContext } from '../ai/domain/usage-mapper';
import { AUDIT_ACTIONS } from '../audit/dto/audit.dto';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { validateActionDto } from './action-dto';
import type { AdminChatRequest, AdminChatResponse, ChatTurn } from './agent-admin.types';
import { AssistantCatalogService, type CatalogContext } from './assistant-catalog.service';
import { AssistantDigestService } from './assistant-digest.service';
import { AssistantQueryService } from './assistant-query.service';
import { AssistantRetentionService } from './assistant-retention.service';
import { AssistantUsageService } from './assistant-usage.service';
import { AssistantConfig } from './assistant.config';
import type {
  CitationDto,
  DigestDto,
  MessageDto,
  QueryResultDto,
  TurnResultDto,
} from './dto/assistant.dto';
import { HelpIndexService } from './help-index.service';
import { toWireChunks } from './domain/help-sections';
import { computePlanHash } from './domain/plan-hash';
import { parsePlan, parseReadQuery, type RawPlan } from './domain/plan-schema';
import { buildActionCall } from './domain/plan-to-dto';
import {
  validatePlan,
  type PlanIssue,
  type PlanValidation,
  type ValidationContext,
} from './domain/plan-validate';
import { computeExpiry } from './domain/plan-state';
import { validateQuery } from './domain/query-validate';
import { toPlanDto } from './plan-view';

const HISTORY_TURNS = 10;
const GROUNDING_PREVIOUS_ADMIN_MESSAGES = 3;
const PLACEHOLDER_UUID = '00000000-0000-4000-8000-000000000000';

const REPLY_NO_PLAN = 'No pude armar un plan con ese pedido. Probá contarlo con otras palabras.';
const REPLY_INVALID =
  'Preparé un plan, pero tiene problemas y no se puede ejecutar. Revisá los motivos y probá de nuevo con más detalle.';

type MessageWithPlan = AssistantMessage & { plan: AssistantPlan | null };

/** Un turno del chat de administración: catálogo + manuales -> agente -> validación en Nest -> persistencia. */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: AiClient,
    private readonly aiConfig: AiConfig,
    private readonly config: AssistantConfig,
    private readonly usage: AssistantUsageService,
    private readonly catalog: AssistantCatalogService,
    private readonly help: HelpIndexService,
    private readonly queries: AssistantQueryService,
    private readonly retention: AssistantRetentionService,
    private readonly digest: AssistantDigestService,
  ) {}

  // -------------------------------------------------------------------- lecturas

  async getDigest(admin: AuthUser, refresh = false): Promise<DigestDto> {
    await this.housekeeping(admin);
    return this.digest.get(admin.id, refresh);
  }

  async listMessages(admin: AuthUser, limit: number): Promise<MessageDto[]> {
    await this.housekeeping(admin);
    const rows = await this.prisma.assistantMessage.findMany({
      where: { adminId: admin.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { plan: true },
    });
    return rows.reverse().map(toMessageDto);
  }

  /** Borra la conversación propia: mensajes y planes que no llegaron a ejecutarse (los ejecutados quedan 90 días por trazabilidad). */
  async deleteConversation(admin: AuthUser): Promise<void> {
    await this.prisma.assistantMessage.deleteMany({ where: { adminId: admin.id } });
    await this.prisma.assistantPlan.deleteMany({
      where: {
        requestedById: admin.id,
        status: { in: ['PROPOSED', 'INVALID', 'DISCARDED', 'EXPIRED'] },
      },
    });
    this.digest.invalidate();
  }

  // ----------------------------------------------------------------------- turno

  async turn(admin: AuthUser, text: string, now = new Date()): Promise<TurnResultDto> {
    await this.housekeeping(admin, now);
    if (!this.config.enabled) {
      throw this.aiConfig.enabled ? mapAgentFailure({ code: 'AI_UNAVAILABLE' }) : aiDisabledError();
    }

    const { history, adminTexts } = await this.loadHistory(admin.id, text);
    const cat = await this.catalog.build();
    const chunks = this.help.search(text, 'ADMIN');
    const { wire, toCanonical } = toWireChunks(chunks);

    const traceId = randomUUID();
    const planId = randomUUID();
    const base: Omit<UsageContext, 'entityType' | 'entityId'> = {
      traceId,
      feature: 'ADMIN_CHAT',
      actorId: admin.id,
    };
    const request: AdminChatRequest = {
      locale: 'es',
      today: now.toISOString().slice(0, 10),
      message: text,
      history,
      catalog: cat.catalog,
      catalogTruncated: cat.truncated,
      helpChunks: wire,
      repair: null,
    };

    const first = await this.callChat(request, traceId, {
      ...base,
      entityType: null,
      entityId: null,
    });
    const data = first;
    const isAction = data.intent === 'ACTION';
    const usageCtx: UsageContext = {
      ...base,
      entityType: isAction ? 'ASSISTANT_PLAN' : null,
      entityId: isAction ? planId : null,
    };
    await this.usage.persist(data.usage, usageCtx);

    const adminCreatedAt = now;
    const assistantCreatedAt = new Date(now.getTime() + 1);
    const adminMessage = {
      adminId: admin.id,
      role: 'ADMIN' as const,
      kind: 'TEXT' as const,
      text,
      traceId,
      createdAt: adminCreatedAt,
    };
    const reply = (data.reply ?? '').slice(0, 2000) || REPLY_NO_PLAN;

    switch (data.intent) {
      case 'ACTION':
        return this.handleAction({
          admin,
          request,
          data,
          cat,
          adminTexts,
          planId,
          traceId,
          now,
          usageCtx,
          adminMessage,
          assistantCreatedAt,
          reply,
        });
      case 'QUERY':
        return this.handleQuery({
          admin,
          data,
          cat,
          adminTexts,
          adminMessage,
          assistantCreatedAt,
          traceId,
          reply,
        });
      case 'HOW_TO': {
        const citations: CitationDto[] = [...new Set(data.citations ?? [])].flatMap((id) => {
          const chunk = toCanonical.get(id);
          return chunk ? [{ id: chunk.id, title: chunk.title, url: chunk.url }] : [];
        });
        return this.persistTurn(
          adminMessage,
          {
            adminId: admin.id,
            role: 'ASSISTANT',
            kind: citations.length > 0 ? 'HELP' : 'TEXT',
            text: reply,
            traceId,
            createdAt: assistantCreatedAt,
            payload:
              citations.length > 0
                ? ({ citations } as unknown as Prisma.InputJsonValue)
                : undefined,
          },
          citations.length > 0 ? { citations } : {},
        );
      }
      default:
        return this.persistTurn(adminMessage, {
          adminId: admin.id,
          role: 'ASSISTANT',
          kind: 'TEXT',
          text: reply,
          traceId,
          createdAt: assistantCreatedAt,
        });
    }
  }

  // ---------------------------------------------------------------------- ACTION

  private async handleAction(args: {
    admin: AuthUser;
    request: AdminChatRequest;
    data: AdminChatResponse;
    cat: CatalogContext;
    adminTexts: string[];
    planId: string;
    traceId: string;
    now: Date;
    usageCtx: UsageContext;
    adminMessage: Prisma.AssistantMessageUncheckedCreateInput;
    assistantCreatedAt: Date;
    reply: string;
  }): Promise<TurnResultDto> {
    const { admin, cat, adminTexts, planId, traceId, now, usageCtx } = args;
    let data = args.data;
    let rawPlan = parsePlan(data.plan);
    if (!rawPlan.ok) {
      return this.persistTurn(args.adminMessage, {
        adminId: admin.id,
        role: 'ASSISTANT',
        kind: 'TEXT',
        text: REPLY_NO_PLAN,
        traceId,
        createdAt: args.assistantCreatedAt,
      });
    }

    let validation = await this.validate(rawPlan.value, cat, adminTexts);
    if (validation.issues.length > 0) {
      // Una sola reparación por turno: se le devuelven los problemas al agente.
      const repairReq: AdminChatRequest = {
        ...args.request,
        repair: { previousPlan: data.plan, issues: validation.issues },
      };
      const outcome = await this.client.postAdmin<AdminChatResponse>(
        '/v1/admin/chat',
        repairReq,
        traceId,
        this.config.agentTimeoutMs,
      );
      if (!outcome.ok) {
        // El plan queda INVALID con sus motivos; el intento fallido igual se registra.
        await this.usage.persistFailure(outcome.failure, usageCtx);
      } else {
        await this.usage.persist(outcome.data.usage, usageCtx);
        data = outcome.data;
        const repaired = parsePlan(outcome.data.plan);
        if (repaired.ok) {
          rawPlan = repaired;
          validation = await this.validate(repaired.value, cat, adminTexts);
        }
      }
    }

    const invalid = validation.issues.length > 0;
    const expiresAt = computeExpiry(now, this.config.planTtlMin);
    const planHash = computePlanHash({
      actions: validation.plan.actions,
      requestedById: admin.id,
      expiresAt,
    });
    const reply = invalid ? REPLY_INVALID : args.reply;

    const planRow = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.assistantPlan.create({
        data: {
          id: planId,
          requestedById: admin.id,
          status: invalid ? 'INVALID' : 'PROPOSED',
          summary: validation.plan.summary,
          assumptions: validation.plan.assumptions,
          actions: validation.plan.actions as unknown as Prisma.InputJsonValue,
          handleMap: cat.handleMap,
          issues: validation.issues as unknown as Prisma.InputJsonValue,
          warnings: validation.warnings as unknown as Prisma.InputJsonValue,
          planHash,
          traceId,
          promptVersion: data.prompt?.version ?? '1',
          expiresAt,
        },
      });
      await tx.assistantMessage.create({ data: args.adminMessage });
      await tx.assistantMessage.create({
        data: {
          adminId: admin.id,
          role: 'ASSISTANT',
          kind: 'PLAN',
          text: reply,
          planId,
          traceId,
          createdAt: args.assistantCreatedAt,
        },
      });
      return plan;
    });

    const planDto = toPlanDto(planRow);
    const messages = await this.lastMessages(admin.id, 2);
    return { messages, plan: planDto };
  }

  /** Validación completa del plan: dominio (whitelist, refs, anclaje, límites) + DTO de Nest de cada acción. */
  private async validate(
    raw: RawPlan,
    cat: CatalogContext,
    adminTexts: string[],
  ): Promise<PlanValidation> {
    const emails = raw.actions
      .filter((a) => a.type === 'CREATE_USER' && typeof a.scalars.email === 'string')
      .map((a) => String(a.scalars.email).trim().toLowerCase());
    const ctx: ValidationContext = {
      handles: cat.handles,
      adminTexts,
      takenEmails: await this.catalog.takenEmails(emails),
      existingTeams: cat.existingTeams,
      objectiveCounts: cat.objectiveCounts,
      krCounts: cat.krCounts,
      catalogTruncated: cat.truncated,
    };
    const result = validatePlan(raw, ctx);

    // Las acciones sin problemas estructurales se validan con la clase DTO real (referencias NEW -> UUID de relleno).
    const flagged = new Set(result.issues.map((i) => i.actionIndex));
    for (const action of result.plan.actions) {
      if (flagged.has(action.index)) continue;
      const call = buildActionCall(action, (ref) =>
        ref.kind === 'EXISTING' ? ref.id : PLACEHOLDER_UUID,
      );
      if (!call.ok) continue;
      const checked = await validateActionDto(call.value);
      if (!checked.ok) {
        result.issues.push({
          actionIndex: action.index,
          code: 'DTO_INVALID',
          message: checked.message,
        });
      }
    }
    return result;
  }

  // ----------------------------------------------------------------------- QUERY

  private async handleQuery(args: {
    admin: AuthUser;
    data: AdminChatResponse;
    cat: CatalogContext;
    adminTexts: string[];
    adminMessage: Prisma.AssistantMessageUncheckedCreateInput;
    assistantCreatedAt: Date;
    traceId: string;
    reply: string;
  }): Promise<TurnResultDto> {
    const { admin, cat, adminTexts, traceId } = args;
    const text = (t: string): Prisma.AssistantMessageUncheckedCreateInput => ({
      adminId: admin.id,
      role: 'ASSISTANT',
      kind: 'TEXT',
      text: t.slice(0, 2000),
      traceId,
      createdAt: args.assistantCreatedAt,
    });

    const raw = parseReadQuery(args.data.query);
    const checked = raw.ok
      ? validateQuery(raw.value, { handles: cat.handles, adminTexts, auditActions: AUDIT_ACTIONS })
      : null;
    if (!checked || !checked.ok) {
      const why =
        checked && !checked.ok
          ? checked.issues[0].message
          : 'La consulta no tiene el formato esperado.';
      return this.persistTurn(
        args.adminMessage,
        text(`No pude armar esa consulta (${why}) Probá reformularla.`),
      );
    }
    const result = await this.queries.run(admin, checked.query);
    return this.persistTurn(
      args.adminMessage,
      {
        adminId: admin.id,
        role: 'ASSISTANT',
        kind: 'QUERY_RESULT',
        text: result.summary.slice(0, 2000),
        traceId,
        createdAt: args.assistantCreatedAt,
        // Filas ya renderizadas; nunca vuelven al agente.
        payload: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
      },
      { query: result },
    );
  }

  // --------------------------------------------------------------------- helpers

  private async callChat(
    request: AdminChatRequest,
    traceId: string,
    ctx: UsageContext,
  ): Promise<AdminChatResponse> {
    const outcome = await this.client.postAdmin<AdminChatResponse>(
      '/v1/admin/chat',
      request,
      traceId,
      this.config.agentTimeoutMs,
    );
    if (outcome.ok) return outcome.data;
    await this.usage.persistFailure(outcome.failure, ctx);
    if (outcome.failure.code === 'AI_INPUT_REJECTED') {
      throw aiDomainError({
        code: 'AI_INPUT_REJECTED',
        message:
          'No pude procesar ese mensaje. Reformulalo con tus palabras y sin instrucciones sobre el asistente.',
      });
    }
    throw mapAgentFailure(outcome.failure);
  }

  private async loadHistory(
    adminId: string,
    text: string,
  ): Promise<{ history: ChatTurn[]; adminTexts: string[] }> {
    const rows = await this.prisma.assistantMessage.findMany({
      where: { adminId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: HISTORY_TURNS,
      include: { plan: true },
    });
    const chronological = rows.reverse();
    const history: ChatTurn[] = chronological.map((m) => ({
      role: m.role,
      // Un plan previo viaja resumido; nunca completo (contrato §3.3).
      text:
        m.kind === 'PLAN' && m.plan
          ? `[plan ${m.plan.status}: ${m.plan.summary}]`.slice(0, 2000)
          : m.text,
    }));
    const previousAdmin = chronological
      .filter((m) => m.role === 'ADMIN')
      .slice(-GROUNDING_PREVIOUS_ADMIN_MESSAGES)
      .map((m) => m.text);
    return { history, adminTexts: [text, ...previousAdmin] };
  }

  private async lastMessages(adminId: string, n: number): Promise<MessageDto[]> {
    const rows = await this.prisma.assistantMessage.findMany({
      where: { adminId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: n,
      include: { plan: true },
    });
    return rows.reverse().map(toMessageDto);
  }

  private async persistTurn(
    adminMessage: Prisma.AssistantMessageUncheckedCreateInput,
    assistantMessage: Prisma.AssistantMessageUncheckedCreateInput,
    extra: { citations?: CitationDto[]; query?: QueryResultDto } = {},
  ): Promise<TurnResultDto> {
    await this.prisma.$transaction([
      this.prisma.assistantMessage.create({ data: adminMessage }),
      this.prisma.assistantMessage.create({ data: assistantMessage }),
    ]);
    const messages = await this.lastMessages(adminMessage.adminId, 2);
    return { messages, ...extra };
  }

  /** Purga perezosa + barrido de EXECUTING abandonados + vencimiento de planes propuestos. */
  private async housekeeping(admin: AuthUser, now = new Date()): Promise<void> {
    try {
      await this.retention.purgeIfDue(now);
      await this.retention.sweepInterrupted(now);
      await this.prisma.assistantPlan.updateMany({
        where: { requestedById: admin.id, status: 'PROPOSED', expiresAt: { lte: now } },
        data: { status: 'EXPIRED' },
      });
    } catch (error) {
      this.logger.warn(`Mantenimiento del asistente fallido: ${(error as Error).message}`);
    }
  }
}

function toMessageDto(row: MessageWithPlan): MessageDto {
  const dto: MessageDto = {
    id: row.id,
    role: row.role,
    kind: row.kind,
    text: row.text,
    createdAt: row.createdAt,
  };
  const plan = row.plan ? toPlanDto(row.plan) : undefined;
  if (row.kind === 'PLAN' && plan) dto.plan = plan;
  if (row.kind === 'EXECUTION_RESULT' && plan?.steps) dto.steps = plan.steps;
  if (row.kind === 'QUERY_RESULT' && row.payload)
    dto.query = row.payload as unknown as QueryResultDto;
  if (row.kind === 'HELP' && row.payload) {
    dto.citations = (row.payload as { citations?: CitationDto[] }).citations ?? [];
  }
  return dto;
}

export type { PlanIssue };
