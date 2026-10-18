/** Estrechamiento de los `payload` del agente (el back los expone como objeto abierto). Sin `any`. */

export type OkrWarning = { code: string; message: string };
export type SuggestedKr = {
  title: string;
  unit: string | null;
  startValue: string | null;
  targetValue: string | null;
  rationale: string;
  proposedValues: boolean;
};
export type OkrSuggestion = {
  objective: { title: string; description: string | null; rationale: string };
  keyResults: SuggestedKr[];
  warnings: OkrWarning[];
};
export type CheckInSummary = {
  summary: string;
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING' | 'INSUFFICIENT_DATA';
  highlights: string[];
  risks: string[];
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

export function parseOkrSuggestion(payload: unknown): OkrSuggestion | null {
  if (!isRecord(payload) || !isRecord(payload.objective)) return null;
  const title = text(payload.objective.title);
  if (!title) return null;
  const keyResults = (Array.isArray(payload.keyResults) ? payload.keyResults : [])
    .filter(isRecord)
    .flatMap((kr): SuggestedKr[] => {
      const krTitle = text(kr.title);
      if (!krTitle) return [];
      return [
        {
          title: krTitle,
          unit: text(kr.unit),
          startValue: text(kr.startValue),
          targetValue: text(kr.targetValue),
          rationale: text(kr.rationale) ?? '',
          proposedValues: kr.proposedValues === true,
        },
      ];
    });
  const warnings = (Array.isArray(payload.warnings) ? payload.warnings : [])
    .filter(isRecord)
    .flatMap((w): OkrWarning[] => {
      const message = text(w.message);
      return message ? [{ code: text(w.code) ?? 'WARNING', message }] : [];
    });
  return {
    objective: {
      title,
      description: text(payload.objective.description),
      rationale: text(payload.objective.rationale) ?? '',
    },
    keyResults,
    warnings,
  };
}

const TRENDS = ['IMPROVING', 'STABLE', 'DECLINING', 'INSUFFICIENT_DATA'] as const;

export function parseCheckInSummary(payload: unknown): CheckInSummary | null {
  if (!isRecord(payload)) return null;
  const summary = text(payload.summary);
  if (!summary) return null;
  const trend = TRENDS.find((t) => t === payload.trend) ?? 'INSUFFICIENT_DATA';
  return { summary, trend, highlights: strings(payload.highlights), risks: strings(payload.risks) };
}
