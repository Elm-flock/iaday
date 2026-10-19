'use client';

import { BookOpenText, Check, ShieldCheck } from 'lucide-react';
import { useId, useRef, useState, useTransition } from 'react';
import {
  acceptAdaptationAction,
  requestAdaptationAction,
  validateAdaptationAction,
  type AdaptedContent,
} from '../actions';
import {
  ADAPTATION_LEVEL_LABEL,
  HELP_EASY_READ_HREF,
  REVIEW_NOTICE,
  VALIDATE_DISABLED_FEEDBACK,
  VALIDATE_DISABLED_PERMISSION,
} from '../messages';
import {
  canAcceptAdaptation,
  isValidatable,
  type AdaptableEntity,
  type AdaptationLevel,
  type ValidationAbility,
} from '../policy';
import { AiStatusBadge } from './ai-status-badge';
import { AiUnavailableNote } from './ai-unavailable-note';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Link } from '@/components/ui/link';
import { Textarea } from '@/components/ui/textarea';

type Props = {
  entityType: AdaptableEntity;
  entityId: string;
  /** Persona que mira: solo quien pidió la versión puede marcar "Me sirve". */
  viewerId: string;
  validation: ValidationAbility;
};

type Failure = { message: string; unavailable: boolean };

const LEVELS: { level: AdaptationLevel; button: string }[] = [
  { level: 'EASY_READ', button: 'Ver en lectura fácil' },
  { level: 'PLAIN', button: 'Ver en lenguaje claro' },
];

/**
 * Hoja cliente de "versión accesible": pide la adaptación (el back la reutiliza si el texto no cambió),
 * la muestra con su estado y deja marcar "Me sirve" o validarla (con corrección humana opcional).
 * Si la IA falla o está apagada se muestra una nota y el resto de la página no se entera.
 */
export function AccessibleVersionPanel({ entityType, entityId, viewerId, validation }: Props) {
  const [adaptation, setAdaptation] = useState<AdaptedContent | null>(null);
  const [loadingLevel, setLoadingLevel] = useState<AdaptationLevel | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [validating, setValidating] = useState(false);
  const [pending, startTransition] = useTransition();
  const regionId = useId();
  const reasonId = useId();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});

  function request(level: AdaptationLevel) {
    setFailure(null);
    setLoadingLevel(level);
    startTransition(async () => {
      const result = await requestAdaptationAction(entityType, entityId, level);
      setLoadingLevel(null);
      if (result.ok) {
        setAdaptation(result.data);
        setValidating(false);
      } else {
        setFailure({ message: result.message, unavailable: result.unavailable });
      }
    });
  }

  function accept(current: AdaptedContent) {
    setFailure(null);
    startTransition(async () => {
      const result = await acceptAdaptationAction(current.id);
      if (result.ok) setAdaptation(result.data);
      else setFailure({ message: result.message, unavailable: result.unavailable });
    });
  }

  function startValidation(current: AdaptedContent) {
    setEdits(Object.fromEntries(current.content.segments.map((s) => [s.key, s.text])));
    setValidating(true);
  }

  function validate(current: AdaptedContent) {
    setFailure(null);
    const changed = current.content.segments.some((s) => (edits[s.key] ?? s.text) !== s.text);
    startTransition(async () => {
      const result = await validateAdaptationAction(current.id, {
        note: noteRef.current?.value,
        ...(changed
          ? {
              content: {
                segments: current.content.segments.map((s) => ({
                  key: s.key,
                  text: (edits[s.key] ?? s.text).trim() || s.text,
                })),
                glossary: current.content.glossary,
              },
            }
          : {}),
      });
      if (result.ok) {
        setAdaptation(result.data);
        setValidating(false);
      } else {
        setFailure({ message: result.message, unavailable: result.unavailable });
      }
    });
  }

  const canAccept = adaptation
    ? canAcceptAdaptation(viewerId, adaptation.requestedById) && adaptation.status === 'DRAFT'
    : false;

  return (
    <section
      aria-label="Versión accesible"
      data-testid="accessible-version"
      className="flex flex-col gap-s15"
    >
      <div className="flex flex-wrap items-center gap-s10">
        {LEVELS.map(({ level, button }) => (
          <Button
            key={level}
            size="sm"
            variant="secondary"
            icon={<BookOpenText size={16} strokeWidth={1.75} aria-hidden="true" />}
            loading={loadingLevel === level}
            disabled={pending && loadingLevel !== level}
            aria-controls={adaptation ? regionId : undefined}
            onClick={() => request(level)}
          >
            {button}
          </Button>
        ))}
      </div>

      <p className="text-body-sm text-ink-muted">
        ¿Necesitás otro formato?{' '}
        <Link href={`/pedidos-adaptacion/nuevo?tipo=${entityType}&id=${entityId}`}>
          Pedilo a una persona
        </Link>
        {' · '}
        <Link href={HELP_EASY_READ_HREF}>¿Qué es la lectura fácil?</Link>
      </p>

      {failure ? (
        failure.unavailable ? (
          <AiUnavailableNote>{failure.message}</AiUnavailableNote>
        ) : (
          <Alert tone="danger">{failure.message}</Alert>
        )
      ) : null}

      {adaptation ? (
        <div
          id={regionId}
          aria-live="polite"
          className="flex flex-col gap-s15 rounded-md border border-border bg-surface-subtle p-s15"
        >
          <div className="flex flex-wrap items-center gap-s10">
            <h4 className="text-body font-bold text-ink">
              {ADAPTATION_LEVEL_LABEL[adaptation.level]}
            </h4>
            <AiStatusBadge status={adaptation.status} />
          </div>

          {adaptation.status === 'NEEDS_REVIEW' ? (
            <Alert tone="warning">{REVIEW_NOTICE}</Alert>
          ) : null}

          <div className="flex flex-col gap-s10" data-testid="adapted-text">
            {adaptation.content.segments.map((segment) => (
              <p key={segment.key} className="whitespace-pre-line text-body text-ink">
                {segment.text}
              </p>
            ))}
          </div>

          {adaptation.content.glossary.length > 0 ? (
            <dl className="flex flex-col gap-s5 border-t border-border pt-s10">
              {adaptation.content.glossary.map((entry) => (
                <div key={entry.term} className="flex flex-col">
                  <dt className="text-body-sm font-bold text-ink">{entry.term}</dt>
                  <dd className="text-body-sm text-ink-muted">{entry.explanation}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {validating ? (
            <form
              className="flex flex-col gap-s15 border-t border-border pt-s15"
              onSubmit={(event) => {
                event.preventDefault();
                validate(adaptation);
              }}
            >
              <p className="text-body-sm text-ink-muted">
                Podés corregir el texto antes de validarlo. Tiene que mantener los mismos bloques,
                en el mismo orden.
              </p>
              {adaptation.content.segments.map((segment, index) => (
                <FormField key={segment.key} label={`Bloque ${index + 1}`}>
                  <Textarea
                    rows={3}
                    value={edits[segment.key] ?? segment.text}
                    onChange={(e) =>
                      setEdits((prev) => ({ ...prev, [segment.key]: e.target.value }))
                    }
                  />
                </FormField>
              ))}
              <FormField label="Nota de validación (opcional)">
                <Textarea ref={noteRef} rows={2} maxLength={1000} />
              </FormField>
              <div className="flex flex-wrap justify-end gap-s10">
                <Button variant="ghost" size="sm" onClick={() => setValidating(false)}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" loading={pending}>
                  Validar versión
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-s10 border-t border-border pt-s10">
              {canAccept ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Check size={16} strokeWidth={1.75} aria-hidden="true" />}
                  loading={pending && loadingLevel === null}
                  onClick={() => accept(adaptation)}
                >
                  Me sirve
                </Button>
              ) : null}
              {adaptation.status === 'ACCEPTED' &&
              canAcceptAdaptation(viewerId, adaptation.requestedById) ? (
                <span className="inline-flex items-center gap-s5 text-body-sm text-ink-muted">
                  <Check size={16} strokeWidth={1.75} aria-hidden="true" />
                  Marcaste que esta versión te sirve.
                </span>
              ) : null}
              {isValidatable(adaptation.status) ? (
                validation.allowed ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<ShieldCheck size={16} strokeWidth={1.75} aria-hidden="true" />}
                    onClick={() => startValidation(adaptation)}
                  >
                    Validar
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled
                      icon={<ShieldCheck size={16} strokeWidth={1.75} aria-hidden="true" />}
                      aria-describedby={reasonId}
                    >
                      Validar
                    </Button>
                    <span id={reasonId} className="text-caption text-ink-muted">
                      {validation.reason === 'feedback'
                        ? VALIDATE_DISABLED_FEEDBACK
                        : VALIDATE_DISABLED_PERMISSION}
                    </span>
                  </>
                )
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
