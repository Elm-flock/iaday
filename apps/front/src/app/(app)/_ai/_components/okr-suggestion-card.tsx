import { Sparkles, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { OkrSuggestion } from '../suggestion-payload';
import { Alert } from '@/components/ui/alert';

type Props = {
  suggestion: OkrSuggestion;
  needsHumanReview: boolean;
  /** `objective`: muestra el objetivo y todos los KRs; `kr`: solo el primer KR (el que se está editando). */
  scope: 'objective' | 'kr';
  /** Botones (usar / descartar). */
  children?: ReactNode;
};

/** Sugerencia de redacción de la IA. Presentacional: nunca se aplica sola. */
export function OkrSuggestionCard({ suggestion, needsHumanReview, scope, children }: Props) {
  const krs = scope === 'kr' ? suggestion.keyResults.slice(0, 1) : suggestion.keyResults;
  return (
    <div
      data-testid="okr-suggestion"
      className="flex flex-col gap-s15 rounded-md border border-border bg-surface-subtle p-s15"
    >
      <div className="flex flex-wrap items-center gap-s10">
        <h4 className="text-body font-bold text-ink">Sugerencia de redacción</h4>
        <span className="inline-flex min-h-6 items-center gap-s5 rounded-pill border border-info bg-info-subtle px-s10 text-caption text-ink">
          <Sparkles size={14} strokeWidth={1.75} aria-hidden="true" className="text-info" />
          Generado por IA
        </span>
      </div>

      {needsHumanReview ? (
        <Alert tone="warning" title="Requiere revisión humana">
          Revisala con cuidado antes de usarla.
        </Alert>
      ) : null}

      {scope === 'objective' ? (
        <div className="flex flex-col gap-s5">
          <h5 className="text-body-sm text-ink-muted">Objetivo</h5>
          <p className="text-body font-bold text-ink">{suggestion.objective.title}</p>
          {suggestion.objective.description ? (
            <p className="whitespace-pre-line text-body text-ink">
              {suggestion.objective.description}
            </p>
          ) : null}
          {suggestion.objective.rationale ? (
            <p className="text-body-sm text-ink-muted">{suggestion.objective.rationale}</p>
          ) : null}
        </div>
      ) : null}

      {krs.length > 0 ? (
        <div className="flex flex-col gap-s10">
          <h5 className="text-body-sm text-ink-muted">
            {scope === 'kr' ? 'Resultado clave' : 'Resultados clave'}
          </h5>
          <ul className="flex flex-col gap-s10">
            {krs.map((kr) => (
              <li key={kr.title} className="flex flex-col gap-s5">
                <p className="text-body text-ink">{kr.title}</p>
                <p className="text-body-sm text-ink-muted">
                  {kr.startValue !== null || kr.targetValue !== null
                    ? `De ${kr.startValue ?? '—'} a ${kr.targetValue ?? '—'}${kr.unit ? ` ${kr.unit}` : ''}`
                    : 'Sin valores de inicio y meta.'}
                </p>
                {kr.proposedValues ? (
                  <p
                    data-testid="proposed-values"
                    className="inline-flex w-fit items-center gap-s5 rounded-sm border border-warning bg-warning-subtle px-s10 py-px text-caption text-ink"
                  >
                    <TriangleAlert
                      size={14}
                      strokeWidth={1.75}
                      aria-hidden="true"
                      className="text-warning"
                    />
                    Valores propuestos por la IA: revisalos
                  </p>
                ) : null}
                {kr.rationale ? (
                  <p className="text-caption text-ink-muted">{kr.rationale}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {suggestion.warnings.length > 0 ? (
        <div className="flex flex-col gap-s5">
          <h5 className="text-body-sm text-ink-muted">Observaciones sobre tu borrador</h5>
          <ul className="list-disc pl-s20 text-body-sm text-ink">
            {suggestion.warnings.map((w) => (
              <li key={`${w.code}-${w.message}`}>{w.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {children}
    </div>
  );
}
