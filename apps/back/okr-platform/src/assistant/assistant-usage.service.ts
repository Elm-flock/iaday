import { Injectable } from '@nestjs/common';
import type { UsageStep } from '../ai/agent-contract.types';
import type { AgentFailure } from '../ai/ai.client';
import { toLlmCallRows, toTransportFailureRow, type UsageContext } from '../ai/domain/usage-mapper';
import { PrismaService } from '../prisma/prisma.service';

/** Persiste una fila LlmCall por cada intento de LLM (también fallidos y fallas de transporte). */
@Injectable()
export class AssistantUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async persist(usage: UsageStep[] | undefined, ctx: UsageContext): Promise<void> {
    if (!usage || usage.length === 0) return;
    await this.prisma.llmCall.createMany({ data: toLlmCallRows(usage, ctx) });
  }

  async persistFailure(failure: AgentFailure, ctx: UsageContext): Promise<void> {
    await this.persist(failure.usage, ctx);
    if (failure.transport) {
      await this.prisma.llmCall.create({ data: toTransportFailureRow(failure.transport, ctx) });
    }
  }
}
