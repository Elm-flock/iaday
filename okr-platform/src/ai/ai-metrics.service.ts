import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { adaptationAdoption, costPerActiveUser, ratio, resolveRange } from './domain/metrics';
import type { ImpactDto, RangeQueryDto, UsageDto, UsageRowDto } from './dto/metrics.dto';

interface UsageSqlRow {
  key: string;
  calls: number;
  failedCalls: number;
  fallbackCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsdEst: number;
  p50: number | null;
  p95: number | null;
}

const toRow = (r: UsageSqlRow): UsageRowDto => ({
  key: r.key,
  calls: r.calls,
  failedCalls: r.failedCalls,
  inputTokens: r.inputTokens,
  outputTokens: r.outputTokens,
  costUsdEst: r.costUsdEst,
  latencyP50Ms: r.p50,
  latencyP95Ms: r.p95,
  fallbackRate: ratio(r.fallbackCalls, r.calls),
});

/**
 * Métricas agregadas de uso e impacto (solo ADMIN). Todo se agrega en SQL (percentile_cont) y
 * por feature/modelo: no hay rankings ni datos por persona identificada (solo conteo de activos).
 */
@Injectable()
export class AiMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async usage(query: RangeQueryDto): Promise<UsageDto> {
    const { from, to } = resolveRange(query.from, query.to);
    // TRANSPORT (agente caido) no es un modelo: se excluye de byModel pero cuenta en byFeature/failures.
    const group = (column: Prisma.Sql, extra: Prisma.Sql = Prisma.empty) =>
      this.prisma.$queryRaw<UsageSqlRow[]>`
        SELECT ${column}::text AS key,
          COUNT(*)::int AS calls,
          (COUNT(*) FILTER (WHERE "status" = 'FAILED'))::int AS "failedCalls",
          (COUNT(*) FILTER (WHERE "isFallback"))::int AS "fallbackCalls",
          COALESCE(SUM("inputTokens"), 0)::float8 AS "inputTokens",
          COALESCE(SUM("outputTokens"), 0)::float8 AS "outputTokens",
          COALESCE(SUM("costUsdEst"), 0)::float8 AS "costUsdEst",
          (percentile_cont(0.5) WITHIN GROUP (ORDER BY "latencyMs")
            FILTER (WHERE "step" <> 'TRANSPORT'))::float8 AS p50,
          (percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs")
            FILTER (WHERE "step" <> 'TRANSPORT'))::float8 AS p95
        FROM "LlmCall"
        WHERE "createdAt" >= ${from} AND "createdAt" <= ${to} ${extra}
        GROUP BY 1
        ORDER BY 2 DESC, 1 ASC`;
    const [byFeature, byModel, failures] = await Promise.all([
      group(Prisma.sql`"feature"`),
      group(Prisma.sql`"model"`, Prisma.sql`AND "step" <> 'TRANSPORT'`),
      this.prisma.$queryRaw<{ step: string; errorCode: string | null; count: number }[]>`
        SELECT "step"::text AS step, "errorCode", COUNT(*)::int AS count
        FROM "LlmCall"
        WHERE "status" = 'FAILED' AND "createdAt" >= ${from} AND "createdAt" <= ${to}
        GROUP BY 1, 2
        ORDER BY 3 DESC, 1 ASC, 2 ASC`,
    ]);
    return { from, to, byFeature: byFeature.map(toRow), byModel: byModel.map(toRow), failures };
  }

  async impact(query: RangeQueryDto): Promise<ImpactDto> {
    const { from, to } = resolveRange(query.from, query.to);
    const inRange = { createdAt: { gte: from, lte: to } };

    const [
      statusGroups,
      suggestionsTotal,
      suggestionsAccepted,
      latency,
      decision,
      delta,
      costGroups,
      active,
    ] = await Promise.all([
      this.prisma.adaptedContent.groupBy({
        by: ['status'],
        where: inRange,
        _count: { _all: true },
      }),
      this.prisma.aiSuggestion.count({ where: inRange }),
      this.prisma.aiSuggestion.count({ where: { ...inRange, acceptedAt: { not: null } } }),
      this.prisma.$queryRaw<{ v: number | null }[]>`
          SELECT (percentile_cont(0.5) WITHIN GROUP (ORDER BY "generationMs"))::float8 AS v
          FROM "AdaptedContent" WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}`,
      this.prisma.$queryRaw<{ v: number | null }[]>`
          SELECT (percentile_cont(0.5) WITHIN GROUP (ORDER BY "timeToDecisionMs"))::float8 AS v
          FROM "AiSuggestion"
          WHERE "timeToDecisionMs" IS NOT NULL AND "createdAt" >= ${from} AND "createdAt" <= ${to}`,
      this.prisma.$queryRaw<{ v: number | null }[]>`
          SELECT AVG(
            ("readability"->'output'->>'szigrisztPazos')::float8
            - ("readability"->'source'->>'szigrisztPazos')::float8
          )::float8 AS v
          FROM "AdaptedContent"
          WHERE "status" <> 'NEEDS_REVIEW'
            AND "readability"->'output'->>'szigrisztPazos' IS NOT NULL
            AND "readability"->'source'->>'szigrisztPazos' IS NOT NULL
            AND "createdAt" >= ${from} AND "createdAt" <= ${to}`,
      this.prisma.llmCall.groupBy({
        by: ['feature'],
        where: { ...inRange, step: { not: 'TRANSPORT' } },
        _sum: { costUsdEst: true },
      }),
      this.prisma.$queryRaw<{ n: number }[]>`
          SELECT COUNT(DISTINCT "actorId")::int AS n
          FROM "LlmCall"
          WHERE "actorId" IS NOT NULL AND "step" <> 'TRANSPORT' AND "createdAt" >= ${from} AND "createdAt" <= ${to}`,
    ]);

    const counts = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all]));
    const adoption = adaptationAdoption(counts);
    const byFeature = costGroups
      .map((g) => ({ feature: g.feature, costUsdEst: Number(g._sum.costUsdEst ?? 0) }))
      .sort((a, b) => (a.feature < b.feature ? -1 : 1));
    const total = byFeature.reduce((acc, f) => acc + f.costUsdEst, 0);
    const activeUsers = active[0]?.n ?? 0;
    const roundedDelta = delta[0]?.v ?? null;

    return {
      from,
      to,
      adoption: {
        adaptationsTotal: adoption.total,
        adaptationsAccepted: adoption.accepted,
        adaptationAcceptanceRate: adoption.rate,
        suggestionsTotal,
        suggestionsAccepted,
        suggestionAcceptanceRate: ratio(suggestionsAccepted, suggestionsTotal),
      },
      time: {
        adaptationLatencyP50Ms: latency[0]?.v ?? null,
        decisionTimeP50Ms: decision[0]?.v ?? null,
      },
      quality: {
        meanReadabilityDelta: roundedDelta === null ? null : Math.round(roundedDelta * 100) / 100,
        needsReviewRate: ratio(counts.NEEDS_REVIEW ?? 0, adoption.total),
      },
      cost: {
        totalCostUsdEst: Math.round(total * 1e8) / 1e8,
        activeUsers,
        costPerActiveUserUsdEst: costPerActiveUser(total, activeUsers),
        byFeature,
      },
    };
  }
}
