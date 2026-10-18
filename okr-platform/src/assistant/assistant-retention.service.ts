import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EXECUTING_STALE_MS } from './domain/plan-state';
import { retentionCutoffs, shouldPurge } from './domain/retention';

/**
 * Retención del asistente: mensajes 30 días, planes 90 días (RGPD 5.1.c/e).
 *
 * Decisión: purga PEREZOSA (al abrir el asistente, como mucho una vez por hora por proceso) y al
 * arrancar, más `npm run assistant:purge` para un cron externo. Sin @nestjs/schedule: no suma una
 * dependencia ni un timer por instancia, el borrado es idempotente (varias instancias no se pisan) y
 * lo único que puede quedar viejo es lo de una persona que dejó de usar el asistente, que cubre el CLI.
 *
 * También barre los planes EXECUTING sin actividad hace más de 5 minutos: INTERRUPTED (nunca se reanudan).
 */
@Injectable()
export class AssistantRetentionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AssistantRetentionService.name);
  private lastPurgeAt: number | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.purgeIfDue(new Date(), true);
    } catch (error) {
      this.logger.warn(`Purga inicial del asistente fallida: ${(error as Error).message}`);
    }
  }

  /** Purga perezosa: no hace nada si ya corrió hace menos de una hora (salvo `force`). */
  async purgeIfDue(now: Date, force = false): Promise<{ messages: number; plans: number } | null> {
    if (!shouldPurge(this.lastPurgeAt, now, force)) return null;
    this.lastPurgeAt = now.getTime();
    return this.purge(now);
  }

  async purge(now: Date): Promise<{ messages: number; plans: number }> {
    const { messagesBefore, plansBefore } = retentionCutoffs(now);
    const messages = await this.prisma.assistantMessage.deleteMany({
      where: { createdAt: { lt: messagesBefore } },
    });
    const plans = await this.prisma.assistantPlan.deleteMany({
      // Un plan en ejecución nunca se borra, aunque sea viejo.
      where: { createdAt: { lt: plansBefore }, status: { not: 'EXECUTING' } },
    });
    return { messages: messages.count, plans: plans.count };
  }

  /** EXECUTING sin actividad -> INTERRUPTED. Devuelve cuántos planes cambió. */
  async sweepInterrupted(now: Date): Promise<number> {
    const { count } = await this.prisma.assistantPlan.updateMany({
      where: {
        status: 'EXECUTING',
        updatedAt: { lt: new Date(now.getTime() - EXECUTING_STALE_MS) },
      },
      data: { status: 'INTERRUPTED', finishedAt: now },
    });
    return count;
  }
}
