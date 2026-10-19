'use server';

import { authedApi } from '@/lib/api/client';
import { callApi, type CallResult } from '@/lib/api/call-api';
import type { components } from '@/lib/api/schema';
import {
  ASSISTANT_COPY,
  MAX_MESSAGE_LENGTH,
  assistantFailure,
  type AssistantContext,
  type AssistantFailure,
} from './messages';

/*
 * Mutaciones del asistente (BFF). Sin cache de Next que invalidar. NUNCA se loguea el texto de la
 * conversación ni `oneTimeSecret`: la clave inicial solo viaja en el resultado de `confirmPlanAction`
 * hacia el estado en memoria del cliente. La autorización real es de Nest (ADMIN; 404 al resto).
 */

type Schemas = components['schemas'];
export type TurnResult = Schemas['TurnResultDto'];
export type ExecutionResult = Schemas['ExecutionResultDto'];
export type PlanView = Schemas['PlanDto'];
export type DigestView = Schemas['DigestDto'];

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      failure: AssistantFailure;
      /** 409 ya decidido: estado final del plan, para mostrarlo en vez de un error. */
      plan?: PlanView;
    };

const fail = (failure: AssistantFailure): ActionResult<never> => ({ ok: false, failure });

function planFromBody(body: unknown): PlanView | undefined {
  const result = (body as { result?: unknown } | null | undefined)?.result;
  return typeof result === 'object' && result !== null ? (result as PlanView) : undefined;
}

function toResult<T>(result: CallResult<T>, context: AssistantContext): ActionResult<T> {
  if (result.ok && result.data !== undefined) return { ok: true, data: result.data };
  if (result.ok) return fail(assistantFailure({ status: 500 }, context));
  const failure = assistantFailure(result.failure, context);
  return {
    ok: false,
    failure,
    plan: failure.kind === 'already-decided' ? planFromBody(result.failure.body) : undefined,
  };
}

/** Manda un mensaje. El back guarda el mensaje solo si todo salió bien: ante un error el texto sigue en el cuadro. */
export async function sendMessageAction(text: string): Promise<ActionResult<TurnResult>> {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) return fail({ kind: 'rejected', message: ASSISTANT_COPY.empty });
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return fail({ kind: 'rejected', message: ASSISTANT_COPY.tooLong });
  }
  const client = await authedApi();
  const result = await callApi(() =>
    client.POST('/assistant/messages', { body: { text: trimmed } }),
  );
  return toResult(result, 'send');
}

/** Confirma y ejecuta un plan. Se envía el `planHash` que la persona vio. */
export async function confirmPlanAction(
  planId: string,
  planHash: string,
): Promise<ActionResult<ExecutionResult>> {
  const client = await authedApi();
  const result = await callApi(() =>
    client.POST('/assistant/plans/{id}/confirm', {
      params: { path: { id: planId } },
      body: { planHash },
    }),
  );
  return toResult(result, 'confirm');
}

export async function discardPlanAction(planId: string): Promise<ActionResult<PlanView>> {
  const client = await authedApi();
  const result = await callApi(() =>
    client.POST('/assistant/plans/{id}/discard', { params: { path: { id: planId } } }),
  );
  return toResult(result, 'discard');
}

export async function clearConversationAction(): Promise<ActionResult<true>> {
  const client = await authedApi();
  const result = await callApi(() => client.DELETE('/assistant/conversation'));
  if (result.ok) return { ok: true, data: true };
  return fail(assistantFailure(result.failure, 'clear'));
}

export async function refreshDigestAction(): Promise<ActionResult<DigestView>> {
  const client = await authedApi();
  const result = await callApi(() =>
    client.GET('/assistant/digest', { params: { query: { refresh: true } } }),
  );
  return toResult(result, 'digest');
}
