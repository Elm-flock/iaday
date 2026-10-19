/**
 * Tipos TS del contrato HTTP NestJS <-> okr-platform-agent (v1).
 * Espejo a mano de `docs/ai/agent-contract.md`: cualquier cambio de forma es un cambio de contrato.
 */

export const AGENT_CONTRACT_VERSION = '1';

export type AgentStepName =
  | 'CLASSIFY'
  | 'GENERATE'
  | 'REPAIR'
  | 'JUDGE'
  | 'REGENERATE'
  // Solo en /v1/admin/* y /v1/help/* (docs/ai/agent-contract-admin.md §2.1).
  | 'PLAN'
  | 'ANSWER'
  | 'SUMMARIZE';

export interface UsageStep {
  step: AgentStepName;
  attempt: number;
  model: string;
  isFallback: boolean;
  promptId: string;
  promptVersion: string;
  promptHash: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsdEst: number;
  status: 'OK' | 'FAILED';
  errorCode: string | null;
}

export type InfleszBand =
  'MUY_DIFICIL' | 'ALGO_DIFICIL' | 'NORMAL' | 'BASTANTE_FACIL' | 'MUY_FACIL';

export interface ReadabilityMetrics {
  fernandezHuerta: number;
  szigrisztPazos: number;
  infleszBand: InfleszBand;
  words: number;
  sentences: number;
  avgSentenceLength: number;
  maxSentenceLength: number;
  unexplainedAcronyms: string[];
}

export interface AgentChecks {
  piiMasked: number;
  sensitiveContent: boolean;
  numbersPreserved: boolean;
  missingTokens: string[];
  judge: { verdict: 'FAITHFUL' | 'UNFAITHFUL' | 'SKIPPED'; reasons: string[] };
  regenerated: boolean;
}

export type ReviewReason = 'VERIFICATION_FAILED' | 'SENSITIVE_CONTENT' | 'READABILITY_BELOW_MIN';

export interface PromptRef {
  id: string;
  version: string;
  hash: string;
}

export interface AgentEnvelopeBase {
  traceId: string;
  needsHumanReview: boolean;
  reviewReason: ReviewReason | null;
  checks: AgentChecks;
  prompt: PromptRef;
  usage: UsageStep[];
}

export type AdaptLevel = 'EASY_READ' | 'PLAIN';
export type AdaptEntityType = 'OBJECTIVE' | 'CHECK_IN' | 'FEEDBACK';

export interface Segment {
  key: string;
  text: string;
}

export interface GlossaryEntry {
  term: string;
  explanation: string;
}

export interface AdaptRequest {
  level: AdaptLevel;
  entityType: AdaptEntityType;
  locale: 'es';
  segments: Segment[];
  mustPreserve?: string[];
}

export interface AdaptResponse extends AgentEnvelopeBase {
  result: { level: AdaptLevel; segments: Segment[]; glossary: GlossaryEntry[] };
  readability: { source: ReadabilityMetrics; output: ReadabilityMetrics };
}

export interface OkrSuggestKeyResultInput {
  title: string;
  unit: string | null;
  startValue: string | null;
  targetValue: string | null;
}

export interface OkrSuggestRequest {
  cycleKind: 'ANNUAL' | 'QUARTER';
  objective: { title: string; description: string | null; type: 'COMMITTED' | 'ASPIRATIONAL' };
  keyResults: OkrSuggestKeyResultInput[];
}

export type OkrWarningCode =
  'KR_IS_ACTIVITY' | 'KR_NOT_MEASURABLE' | 'OBJECTIVE_IS_METRIC' | 'TOO_MANY_KRS' | 'TOO_FEW_KRS';

export interface OkrSuggestResult {
  objective: { title: string; description: string | null; rationale: string };
  keyResults: (OkrSuggestKeyResultInput & { rationale: string; proposedValues: boolean })[];
  warnings: { code: OkrWarningCode; message: string }[];
}

export interface OkrSuggestResponse extends AgentEnvelopeBase {
  result: OkrSuggestResult;
  readability: { output: ReadabilityMetrics };
}

export interface CheckinSummaryRequest {
  level: 'STANDARD' | 'PLAIN';
  keyResult: {
    title: string;
    scoring: 'DERIVED' | 'MANUAL';
    unit: string | null;
    startValue: string | null;
    targetValue: string | null;
    currentValue: string | null;
  };
  checkIns: {
    date: string;
    value: string | null;
    score: number;
    band: 'RED' | 'YELLOW' | 'GREEN';
    action: 'CONTINUE' | 'UPDATE' | 'START' | 'STOP';
    note: string | null;
  }[];
}

export interface CheckinSummaryResult {
  summary: string;
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING' | 'INSUFFICIENT_DATA';
  highlights: string[];
  risks: string[];
}

export interface CheckinSummaryResponse extends AgentEnvelopeBase {
  result: CheckinSummaryResult;
  readability: { output: ReadabilityMetrics };
}

export type AgentErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_REQUEST'
  | 'INPUT_REJECTED'
  | 'OUTPUT_INVALID'
  | 'MODEL_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface AgentErrorEnvelope {
  traceId: string | null;
  error: {
    code: AgentErrorCode;
    message: string;
    retryable: boolean;
    details: Record<string, unknown>;
  };
  usage: UsageStep[];
}
