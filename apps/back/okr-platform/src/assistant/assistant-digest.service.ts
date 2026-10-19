import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AiClient } from '../ai/ai.client';
import type { UsageContext } from '../ai/domain/usage-mapper';
import { PrismaService } from '../prisma/prisma.service';
import type { DigestSummaryRequest, DigestSummaryResponse } from './agent-admin.types';
import { AssistantConfig } from './assistant.config';
import { AssistantUsageService } from './assistant-usage.service';
import type { DigestDto } from './dto/assistant.dto';
import {
  activeFactKeys,
  computeDigestFacts,
  factCount,
  SENSITIVE_ACTIONS,
  SENSITIVE_WINDOW_HOURS,
  todayInZone,
  type DigestFacts,
  type DigestInput,
  type FactKey,
  type SensitiveAction,
} from './domain/digest-facts';
import {
  isSummaryAcceptable,
  parseSummary,
  templateSummary,
  type DigestSummary,
} from './domain/digest-fidelity';

export const DIGEST_CACHE_MS = 10 * 60_000;

/** Pantalla donde se resuelve cada novedad (rutas de la app). */
export const FACT_LINKS: Record<FactKey, string> = {
  cyclesToClose: '/ciclos',
  adaptationRequestsOpen: '/admin/pedidos-adaptacion',
  overdueCheckIns: '/check-ins',
  krsInRed: '/objetivos',
  cyclesEndingSoon: '/ciclos',
  draftsNotPublishable: '/objetivos',
  usersWithoutTeam: '/admin/usuarios',
  teamsWithoutLead: '/equipos',
  adaptationsNeedingReview: '/admin/uso-ia',
  recentSensitiveChanges: '/admin/auditoria',
};

const clip = (s: string, n = 200): string => (s.length > n ? s.slice(0, n) : s);

/**
 * Novedades del asistente: los hechos se calculan acá, de forma determinista (sin feedback ni la persona
 * que pidió un documento adaptado); el agente solo los redacta y Nest verifica que no invente números.
 */
@Injectable()
export class AssistantDigestService {
  private readonly logger = new Logger(AssistantDigestService.name);
  private readonly cache = new Map<string, { at: number; dto: DigestDto }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: AiClient,
    private readonly config: AssistantConfig,
    private readonly usage: AssistantUsageService,
  ) {}

  invalidate(): void {
    this.cache.clear();
  }

  async get(adminId: string, refresh = false, now = new Date()): Promise<DigestDto> {
    const hit = this.cache.get(adminId);
    if (!refresh && hit && now.getTime() - hit.at < DIGEST_CACHE_MS) return hit.dto;

    const today = todayInZone(now, this.config.timeZone);
    const facts = computeDigestFacts(await this.loadInput(now, today));
    const { summary, source } = await this.summarize(adminId, facts, today);
    const dto: DigestDto = {
      headline: summary.headline,
      items: summary.items.map((i) => ({
        factKey: i.factKey,
        text: i.text,
        count: factCount(facts, i.factKey),
        href: FACT_LINKS[i.factKey],
      })),
      source,
      generatedAt: now,
      chatAvailable: this.config.enabled,
    };
    this.cache.set(adminId, { at: now.getTime(), dto });
    return dto;
  }

  private async summarize(
    adminId: string,
    facts: DigestFacts,
    today: string,
  ): Promise<{ summary: DigestSummary; source: 'AI' | 'TEMPLATE' }> {
    const template = templateSummary(facts);
    // Nada que redactar o agente apagado: plantilla, sin llamar al agente.
    if (activeFactKeys(facts).length === 0 || !this.config.enabled) {
      return { summary: template, source: 'TEMPLATE' };
    }
    const traceId = randomUUID();
    const ctx: UsageContext = {
      traceId,
      feature: 'ADMIN_DIGEST',
      actorId: adminId,
      entityType: null,
      entityId: null,
    };
    const body: DigestSummaryRequest = { locale: 'es', today, facts };
    const outcome = await this.client.postAdmin<DigestSummaryResponse>(
      '/v1/admin/digest-summary',
      body,
      traceId,
      this.config.agentTimeoutMs,
    );
    if (!outcome.ok) {
      await this.usage.persistFailure(outcome.failure, ctx);
      return { summary: template, source: 'TEMPLATE' };
    }
    await this.usage.persist(outcome.data.usage, ctx);
    const parsed = parseSummary(outcome.data.summary);
    if (!parsed || !isSummaryAcceptable(parsed, facts)) {
      this.logger.warn(`Resumen del agente descartado por fidelidad (traceId=${traceId})`);
      return { summary: template, source: 'TEMPLATE' };
    }
    return { summary: parsed, source: 'AI' };
  }

  private async loadInput(now: Date, today: string): Promise<DigestInput> {
    const windowStart = new Date(now.getTime() - SENSITIVE_WINDOW_HOURS * 3_600_000);
    const [
      krs,
      cycles,
      drafts,
      ownerObjectives,
      usersNoTeam,
      teamsNoLead,
      needsReview,
      requests,
      audit,
    ] = await Promise.all([
      this.prisma.keyResult.findMany({
        where: { objective: { status: 'PUBLISHED', cycle: { status: { not: 'CLOSED' } } } },
        select: {
          title: true,
          lastCheckInAt: true,
          owner: { select: { name: true } },
          objective: {
            select: {
              title: true,
              status: true,
              publishedAt: true,
              cycle: { select: { checkInCadence: true } },
            },
          },
          checkIns: { orderBy: { createdAt: 'desc' }, take: 1, select: { band: true } },
        },
      }),
      this.prisma.cycle.findMany({
        where: { status: 'ACTIVE' },
        select: { name: true, status: true, endDate: true },
      }),
      this.prisma.objective.findMany({
        where: { status: 'DRAFT', cycle: { status: 'ACTIVE' } },
        select: {
          title: true,
          cycleId: true,
          ownerUserId: true,
          ownerTeamId: true,
          ownerUser: { select: { name: true } },
          ownerTeam: { select: { name: true } },
          _count: { select: { keyResults: true } },
        },
      }),
      this.prisma.objective.findMany({
        where: { status: { in: ['DRAFT', 'PUBLISHED'] }, cycle: { status: 'ACTIVE' } },
        select: { cycleId: true, ownerUserId: true, ownerTeamId: true },
      }),
      this.prisma.user.findMany({
        where: { active: true, memberships: { none: {} } },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.team.findMany({
        where: { members: { none: { isLead: true } } },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.adaptedContent.count({
        where: { status: 'NEEDS_REVIEW', entityType: { not: 'FEEDBACK' } },
      }),
      this.prisma.adaptationRequest.findMany({
        where: { status: { in: ['PENDIENTE', 'EN_CURSO'] } },
        // Sin requesterId, asunto ni descripción: pueden revelar una discapacidad (RGPD art. 9).
        select: { dueDate: true, assigneeId: true, entityType: true, preferredFormat: true },
      }),
      this.prisma.auditLog.findMany({
        where: {
          createdAt: { gte: windowStart },
          action: { in: [...SENSITIVE_ACTIONS] },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          action: true,
          entityType: true,
          entityId: true,
          createdAt: true,
          actor: { select: { name: true } },
        },
      }),
    ]);

    const ownerCount = new Map<string, number>();
    for (const o of ownerObjectives) {
      const key = `${o.cycleId}|${o.ownerUserId ?? o.ownerTeamId}`;
      ownerCount.set(key, (ownerCount.get(key) ?? 0) + 1);
    }
    const labels = await this.entityLabels(audit);

    return {
      now,
      today,
      krs: krs.map((k) => ({
        krTitle: clip(k.title),
        objectiveTitle: clip(k.objective.title),
        ownerName: clip(k.owner.name),
        objectiveStatus: k.objective.status,
        publishedAt: k.objective.publishedAt,
        lastCheckInAt: k.lastCheckInAt,
        cadence: k.objective.cycle.checkInCadence,
        lastBand: k.checkIns[0]?.band ?? null,
      })),
      cycles: cycles.map((c) => ({ name: clip(c.name), status: c.status, endDate: c.endDate })),
      drafts: drafts.map((d) => ({
        objectiveTitle: clip(d.title),
        ownerName: clip(d.ownerUser?.name ?? d.ownerTeam?.name ?? '—'),
        krCount: d._count.keyResults,
        ownerObjectiveCount: ownerCount.get(`${d.cycleId}|${d.ownerUserId ?? d.ownerTeamId}`) ?? 0,
      })),
      usersWithoutTeam: usersNoTeam.map((u) => ({ userName: clip(u.name) })),
      teamsWithoutLead: teamsNoLead.map((t) => ({ teamName: clip(t.name) })),
      adaptationsNeedingReview: needsReview,
      adaptationRequests: requests.map((r) => ({
        dueDate: r.dueDate,
        assigned: r.assigneeId !== null,
        entityKind: r.entityType ?? 'GENERAL',
        preferredFormat: r.preferredFormat,
      })),
      sensitiveChanges: audit.map((a) => ({
        action: a.action as SensitiveAction,
        actorName: clip(a.actor?.name ?? 'Sistema'),
        entityLabel: clip(labels.get(`${a.entityType}:${a.entityId}`) ?? a.entityType),
        at: a.createdAt,
      })),
    };
  }

  private async entityLabels(
    rows: { entityType: string; entityId: string }[],
  ): Promise<Map<string, string>> {
    const ids = (type: string) => [
      ...new Set(rows.filter((r) => r.entityType === type).map((r) => r.entityId)),
    ];
    const [users, cycles, krs] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids('User') } },
        select: { id: true, name: true },
      }),
      this.prisma.cycle.findMany({
        where: { id: { in: ids('Cycle') } },
        select: { id: true, name: true },
      }),
      this.prisma.keyResult.findMany({
        where: { id: { in: ids('KeyResult') } },
        select: { id: true, title: true },
      }),
    ]);
    const map = new Map<string, string>();
    users.forEach((u) => map.set(`User:${u.id}`, u.name));
    cycles.forEach((c) => map.set(`Cycle:${c.id}`, c.name));
    krs.forEach((k) => map.set(`KeyResult:${k.id}`, k.title));
    return map;
  }
}
