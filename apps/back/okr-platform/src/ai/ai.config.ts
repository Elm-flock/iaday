import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Configuración de IA. Se lee en cada acceso (getters) para poder prender/apagar la feature
 * sin reiniciar en tests; en producción las variables son estáticas.
 */
@Injectable()
export class AiConfig {
  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<string>('AI_ENABLED') === 'true';
  }

  get agentUrl(): string {
    return (this.config.get<string>('AGENT_URL') ?? 'http://localhost:8088').replace(/\/+$/, '');
  }

  get sharedSecret(): string {
    return this.config.get<string>('AGENT_SHARED_SECRET') ?? '';
  }

  get timeoutMs(): number {
    return positiveInt(this.config.get<string>('AGENT_TIMEOUT_MS'), 125_000);
  }

  /** Cuánto se reutiliza `GET /health` del agente para conocer sus prompts vigentes (0 = sin caché). */
  get promptsTtlMs(): number {
    const raw = this.config.get<string>('AI_PROMPTS_TTL_MS');
    const n = Number(raw);
    return raw !== undefined && raw !== '' && Number.isInteger(n) && n >= 0 ? n : 60_000;
  }

  get throttleLimit(): number {
    return positiveInt(this.config.get<string>('AI_THROTTLE_LIMIT'), 20);
  }
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
