'use client';

import { Sparkles } from 'lucide-react';
import { useState, useTransition } from 'react';
import { decideSuggestionAction, summarizeCheckInsAction, type AiSuggestion } from '../actions';
import { parseCheckInSummary } from '../suggestion-payload';
import { AiUnavailableNote } from './ai-unavailable-note';
import { CheckInSummaryCard } from './checkin-summary-card';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

type Failure = { message: string; unavailable: boolean };

/**
 * "Resumir check-ins" de un KR. Pide el resumen, lo muestra con su marca de IA y deja marcarlo como
 * útil o descartarlo (métrica de adopción). No cambia nada del KR ni de los check-ins.
 */
export function CheckInSummaryButton({ krId }: { krId: string }) {
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null);
  const [decided, setDecided] = useState<'accept' | 'discard' | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loading, startLoading] = useTransition();
  const [deciding, startDeciding] = useTransition();

  const summary = suggestion ? parseCheckInSummary(suggestion.payload) : null;

  function request() {
    setFailure(null);
    setDecided(null);
    startLoading(async () => {
      const result = await summarizeCheckInsAction(krId);
      if (result.ok) setSuggestion(result.data);
      else setFailure({ message: result.message, unavailable: result.unavailable });
    });
  }

  function decide(decision: 'accept' | 'discard') {
    if (!suggestion) return;
    startDeciding(async () => {
      const result = await decideSuggestionAction(suggestion.id, decision);
      // Ya decidida (409) cuenta como decidida: la persona no tiene nada más que hacer.
      if (result.ok || result.message.includes('Ya decidiste')) {
        setDecided(decision);
        if (decision === 'discard') setSuggestion(null);
      } else {
        setFailure({ message: result.message, unavailable: result.unavailable });
      }
    });
  }

  return (
    <div className="flex flex-col gap-s10">
      <div>
        <Button
          size="sm"
          variant="secondary"
          icon={<Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />}
          loading={loading}
          onClick={request}
        >
          Resumir check-ins
        </Button>
      </div>

      {failure ? (
        failure.unavailable ? (
          <AiUnavailableNote>{failure.message}</AiUnavailableNote>
        ) : (
          <Alert tone="danger">{failure.message}</Alert>
        )
      ) : null}

      {suggestion && summary ? (
        <CheckInSummaryCard summary={summary} needsHumanReview={suggestion.needsHumanReview}>
          {decided === 'accept' ? (
            <p role="status" className="text-body-sm text-ink-muted">
              Gracias: anotamos que te sirvió.
            </p>
          ) : (
            <div className="flex flex-wrap gap-s10">
              <Button
                size="sm"
                variant="secondary"
                loading={deciding}
                onClick={() => decide('accept')}
              >
                Me sirve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={deciding}
                onClick={() => decide('discard')}
              >
                Descartar
              </Button>
            </div>
          )}
        </CheckInSummaryCard>
      ) : null}
      {suggestion && !summary ? (
        <Alert tone="warning">No pudimos mostrar el resumen. Probá de nuevo en unos minutos.</Alert>
      ) : null}
    </div>
  );
}
