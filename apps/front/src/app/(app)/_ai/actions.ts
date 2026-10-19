'use server';

import { authedApi } from '@/lib/api/client';
import { callApi, type CallResult } from '@/lib/api/call-api';
import type { components } from '@/lib/api/schema';
import { aiFailureMessage, isAiUnavailable, type AiContext } from './messages';
import { isAdaptableEntity, isAdaptationLevel } from './policy';

/*
 * Mutaciones de IA (BFF). No hay cache de Next que invalidar: las adaptaciones y sugerencias se
 * piden por request y viven en el estado del cliente. Nunca se loguea el contenido (el de feedback
 * es privado). La autorización real es de Nest; acá solo se normaliza el resultado para la UI.
 */

type Schemas = components['schemas'];
export type AdaptedContent = Schemas['AdaptedContentDto'];
export type AiSuggestion = Schemas['AiSuggestionDto'];

export type AiActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      message: string;
      /** La IA no está disponible (apagada o caída): se muestra como nota no bloqueante. */
      unavailable: boolean;
    };

function toResult<T>(result: CallResult<T>, context: AiContext): AiActionResult<T> {
  if (result.ok && result.data !== undefined) return { ok: true, data: result.data };
  if (result.ok) {
    return { ok: false, unavailable: false, message: aiFailureMessage({ status: 500 }, context) };
  }
  return {
    ok: false,
    unavailable: isAiUnavailable(result.failure),
    message: aiFailureMessage(result.failure, context),
  };
}

const invalid = (context: AiContext): AiActionResult<never> => ({
  ok: false,
  unavailable: false,
  message: aiFailureMessage({ status: 400 }, context),
});

/** Genera (o trae de la caché del back) la versión accesible. `entityType` y `level` vienen del cliente: se validan. */
export async function requestAdaptationAction(
  entityType: string,
  entityId: string,
  level: string,
): Promise<AiActionResult<AdaptedContent>> {
  if (!isAdaptableEntity(entityType) || !isAdaptationLevel(level)) return invalid('adapt');
  const client = await authedApi();
  const result = await callApi(() =>
    client.POST('/ai/adapt/{entityType}/{id}', {
      params: { path: { entityType, id: entityId }, query: { level } },
    }),
  );
  return toResult(result, 'adapt');
}

/** "Me sirve": solo quien pidió la versión (el back responde 403 al resto). */
export async function acceptAdaptationAction(id: string): Promise<AiActionResult<AdaptedContent>> {
  const client = await authedApi();
  const result = await callApi(() =>
    client.POST('/ai/adapted/{id}/accept', { params: { path: { id } } }),
  );
  return toResult(result, 'decide');
}

export type ValidateInput = {
  note?: string;
  /** Corrección humana: mismas claves y orden de segmentos que la versión de la IA. */
  content?: {
    segments: { key: string; text: string }[];
    glossary?: { term: string; explanation: string }[];
  };
};

/** Validación humana (con corrección opcional). Admin o líder del equipo; feedback nunca. */
export async function validateAdaptationAction(
  id: string,
  input: ValidateInput,
): Promise<AiActionResult<AdaptedContent>> {
  const note = input.note?.trim();
  const body: Schemas['ValidateAdaptationDto'] = {
    ...(note ? { note } : {}),
    ...(input.content ? { content: input.content } : {}),
  };
  const client = await authedApi();
  const result = await callApi(() =>
    client.PATCH('/ai/adapted/{id}/validate', { params: { path: { id } }, body }),
  );
  return toResult(result, 'decide');
}

export type SuggestOkrInput = {
  cycleId: string;
  objectiveId?: string;
  ownerUserId?: string;
  ownerTeamId?: string;
  draft: Schemas['DraftObjectiveDto'];
};

/** Pide una sugerencia de redacción. NUNCA modifica el objetivo: la persona decide si la usa. */
export async function suggestOkrAction(
  input: SuggestOkrInput,
): Promise<AiActionResult<AiSuggestion>> {
  const client = await authedApi();
  const result = await callApi(() => client.POST('/ai/okr-suggest', { body: input }));
  return toResult(result, 'suggest');
}

/** Resumen del historial de check-ins de un KR (no evalúa personas). */
export async function summarizeCheckInsAction(
  krId: string,
  level: 'STANDARD' | 'PLAIN' = 'STANDARD',
): Promise<AiActionResult<AiSuggestion>> {
  const client = await authedApi();
  const result = await callApi(() =>
    client.POST('/ai/check-ins/{krId}/summary', {
      params: { path: { krId }, query: { level: level === 'PLAIN' ? 'PLAIN' : 'STANDARD' } },
    }),
  );
  return toResult(result, 'summary');
}

/** Registra si la sugerencia se usó o se descartó (métrica de adopción). No aplica cambios. */
export async function decideSuggestionAction(
  id: string,
  decision: 'accept' | 'discard',
): Promise<AiActionResult<AiSuggestion>> {
  const client = await authedApi();
  const result = await callApi(() =>
    decision === 'accept'
      ? client.POST('/ai/suggestions/{id}/accept', { params: { path: { id } } })
      : client.POST('/ai/suggestions/{id}/discard', { params: { path: { id } } }),
  );
  return toResult(result, 'decide');
}
