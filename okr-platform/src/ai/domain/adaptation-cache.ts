import type { AdaptationStatus } from './adaptation-state';

/** Identidad de un prompt tal como la expone el agente (`GET /health` → `prompts[]`). */
export interface PromptIdentity {
  id: string;
  version: string;
}

export type CacheDecision = 'SERVE' | 'REGENERATE';

type Level = 'EASY_READ' | 'PLAIN';

/** Id del prompt de generación que usa el agente para cada nivel de adaptación. */
export function promptIdForLevel(level: Level): string {
  return level === 'EASY_READ' ? 'easy_read' : 'plain_language';
}

/** Busca en los prompts cargados por el agente el vigente para un nivel (null si no lo informa). */
export function currentPromptFor(
  level: Level,
  prompts: PromptIdentity[] | null,
): PromptIdentity | null {
  const id = promptIdForLevel(level);
  return prompts?.find((p) => p.id === id) ?? null;
}

/**
 * ¿Sirvo la fila cacheada o regenero? La clave de caché es solo el texto fuente; el prompt se decide acá.
 * - VALIDATED / ACCEPTED: una persona respondió por ese contenido para ese texto → siempre se sirve.
 * - DRAFT / NEEDS_REVIEW: solo si se generaron con el prompt vigente del agente.
 * - Si no se conoce el prompt vigente (agente sin /health o inalcanzable) → se sirve: no se puede
 *   regenerar sin agente y no hay evidencia de que esté vencida.
 */
export function decideAdaptationCache(
  row: { status: AdaptationStatus; promptId: string; promptVersion: string },
  current: PromptIdentity | null,
): CacheDecision {
  if (row.status === 'VALIDATED' || row.status === 'ACCEPTED') return 'SERVE';
  if (!current) return 'SERVE';
  return row.promptId === current.id && row.promptVersion === current.version
    ? 'SERVE'
    : 'REGENERATE';
}
