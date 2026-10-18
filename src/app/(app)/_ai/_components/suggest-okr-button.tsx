'use client';

import { WandSparkles } from 'lucide-react';
import { useState, useTransition } from 'react';
import { decideSuggestionAction, suggestOkrAction } from '../actions';
import { parseOkrSuggestion, type OkrSuggestion } from '../suggestion-payload';
import type { BuiltInput } from '../suggest-input';
import { AiUnavailableNote } from './ai-unavailable-note';
import { OkrSuggestionCard } from './okr-suggestion-card';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

type Props = {
  /** Lee el formulario y arma el pedido (o explica qué falta). */
  buildInput: () => BuiltInput;
  /** "Usar sugerencia": la hoja que contiene el formulario precarga los campos. NUNCA envía. */
  onUse: (suggestion: OkrSuggestion) => void;
  scope: 'objective' | 'kr';
};

type Failure = { message: string; unavailable: boolean };

/**
 * "Sugerir redacción": pide la sugerencia y la muestra aparte. La persona decide: "Usar sugerencia"
 * precarga los campos del formulario (que sigue siendo suyo: revisa y envía con su botón de siempre)
 * o "Descartar" la cierra. Nada se aplica automáticamente.
 */
export function SuggestOkrButton({ buildInput, onUse, scope }: Props) {
  const [suggestion, setSuggestion] = useState<{
    id: string;
    needsHumanReview: boolean;
    parsed: OkrSuggestion;
  } | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loading, startLoading] = useTransition();
  const [, startDeciding] = useTransition();

  function request() {
    setFailure(null);
    const built = buildInput();
    if (!built.ok) {
      setSuggestion(null);
      setFailure({ message: built.message, unavailable: false });
      return;
    }
    startLoading(async () => {
      const result = await suggestOkrAction(built.input);
      if (!result.ok) {
        setSuggestion(null);
        setFailure({ message: result.message, unavailable: result.unavailable });
        return;
      }
      const parsed = parseOkrSuggestion(result.data.payload);
      if (!parsed) {
        setSuggestion(null);
        setFailure({
          message: 'No pudimos mostrar la sugerencia. Probá de nuevo en unos minutos.',
          unavailable: false,
        });
        return;
      }
      setSuggestion({ id: result.data.id, needsHumanReview: result.data.needsHumanReview, parsed });
    });
  }

  function decide(decision: 'accept' | 'discard') {
    if (!suggestion) return;
    const { id, parsed } = suggestion;
    // El cierre es inmediato: la métrica de adopción se registra aparte y su fallo no bloquea a la persona.
    setSuggestion(null);
    if (decision === 'accept') onUse(parsed);
    startDeciding(async () => {
      await decideSuggestionAction(id, decision);
    });
  }

  return (
    <div className="flex flex-col gap-s10">
      <div>
        <Button
          variant="secondary"
          size="sm"
          icon={<WandSparkles size={16} strokeWidth={1.75} aria-hidden="true" />}
          loading={loading}
          onClick={request}
        >
          Sugerir redacción
        </Button>
      </div>

      {failure ? (
        failure.unavailable ? (
          <AiUnavailableNote>{failure.message}</AiUnavailableNote>
        ) : (
          <Alert tone="warning">{failure.message}</Alert>
        )
      ) : null}

      {suggestion ? (
        <OkrSuggestionCard
          suggestion={suggestion.parsed}
          needsHumanReview={suggestion.needsHumanReview}
          scope={scope}
        >
          <div className="flex flex-wrap gap-s10">
            <Button size="sm" variant="secondary" onClick={() => decide('accept')}>
              Usar sugerencia
            </Button>
            <Button size="sm" variant="ghost" onClick={() => decide('discard')}>
              Descartar
            </Button>
          </div>
        </OkrSuggestionCard>
      ) : null}
    </div>
  );
}
