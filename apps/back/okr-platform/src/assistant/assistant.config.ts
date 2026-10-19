import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiConfig } from '../ai/ai.config';
import { DEFAULT_PLAN_TTL_MIN } from './domain/plan-state';

/** Configuración del asistente; se lee en cada acceso (getters) para poder cambiarla en tests. */
@Injectable()
export class AssistantConfig {
  constructor(
    private readonly config: ConfigService,
    private readonly ai: AiConfig,
  ) {}

  /** Requiere además AI_ENABLED: el asistente usa el mismo agente. */
  get enabled(): boolean {
    return this.config.get<string>('ASSISTANT_ENABLED') === 'true' && this.ai.enabled;
  }

  get planTtlMin(): number {
    return positiveInt(this.config.get<string>('ASSISTANT_PLAN_TTL_MIN'), DEFAULT_PLAN_TTL_MIN);
  }

  get agentTimeoutMs(): number {
    return positiveInt(this.config.get<string>('ASSISTANT_AGENT_TIMEOUT_MS'), 120_000);
  }

  /** Zona horaria de la organización (para "hoy" en las novedades y el catálogo). */
  get timeZone(): string {
    return this.config.get<string>('ASSISTANT_TIMEZONE') ?? 'America/Argentina/Buenos_Aires';
  }
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
