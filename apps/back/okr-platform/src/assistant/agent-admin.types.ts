import type { UsageStep } from '../ai/agent-contract.types';
import type { Catalog } from './domain/catalog';
import type { HelpChunk } from './domain/bm25';
import type { DigestFacts } from './domain/digest-facts';

/** Espejo de docs/ai/agent-contract-admin.md (v1): solo lo que el back envía y lee. */

export interface ChatTurn {
  role: 'ADMIN' | 'ASSISTANT';
  text: string;
}

export interface AdminChatRequest {
  locale: 'es';
  today: string;
  message: string;
  history: ChatTurn[];
  catalog: Catalog;
  catalogTruncated: boolean;
  helpChunks: HelpChunk[];
  repair: {
    previousPlan: unknown;
    issues: { actionIndex: number | null; code: string; message: string }[];
  } | null;
}

export type AdminIntent = 'ACTION' | 'QUERY' | 'HOW_TO' | 'CLARIFY' | 'OUT_OF_SCOPE' | 'SMALL_TALK';

export interface AdminChatResponse {
  traceId: string;
  intent: AdminIntent;
  reply: string;
  plan: unknown;
  query?: unknown;
  citations: string[];
  prompt: { id: string; version: string; hash: string };
  usage: UsageStep[];
}

export interface DigestSummaryRequest {
  locale: 'es';
  today: string;
  facts: DigestFacts;
}

export interface DigestSummaryResponse {
  traceId: string;
  summary: unknown;
  checks?: { fallbackUsed?: boolean };
  prompt: { id: string; version: string; hash: string };
  usage: UsageStep[];
}
