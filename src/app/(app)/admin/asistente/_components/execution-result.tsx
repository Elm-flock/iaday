import { CircleCheck, CircleX, MinusCircle, type LucideIcon } from 'lucide-react';
import { OneTimeSecret } from '../../../_components/one-time-secret';
import { EXECUTION_HEADLINE, STEP_STATUS, internalHref } from '../messages';
import { Link } from '@/components/ui/link';
import type { components } from '@/lib/api/schema';

type Step = components['schemas']['StepResultDto'];

const STEP_ICON: Record<Step['status'], { Icon: LucideIcon; className: string }> = {
  OK: { Icon: CircleCheck, className: 'text-success' },
  FAILED: { Icon: CircleX, className: 'text-danger' },
  SKIPPED: { Icon: MinusCircle, className: 'text-ink-muted' },
};

export function overallStatus(steps: Step[]): 'EXECUTED' | 'PARTIAL' | 'FAILED' {
  const failed = steps.some((s) => s.status === 'FAILED');
  if (!failed) return 'EXECUTED';
  return steps.some((s) => s.status === 'OK') ? 'PARTIAL' : 'FAILED';
}

type Props = {
  /** Id del encabezado (para llevar el foco al resultado). */
  headingId: string;
  steps: Step[];
};

/**
 * Resultado por paso de un plan ejecutado. El estado va con ícono Y palabra. La clave inicial
 * (`oneTimeSecret`) solo existe si este render viene de la respuesta de confirmar: el historial del
 * back nunca la trae.
 */
export function ExecutionResult({ headingId, steps }: Props) {
  const status = overallStatus(steps);
  return (
    <div
      data-testid="execution-result"
      className="flex flex-col gap-s15 rounded-lg border border-border bg-surface p-s15"
    >
      <h4
        id={headingId}
        tabIndex={-1}
        className="text-heading-3 font-light tracking-heading text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        {EXECUTION_HEADLINE[status]}
      </h4>
      {status !== 'EXECUTED' ? (
        <p className="text-body-sm text-ink-muted">
          El asistente se detiene en el primer error. Lo que ya se hizo queda hecho: no se deshace
          solo.
        </p>
      ) : null}
      <ol className="flex flex-col gap-s15">
        {steps.map((step) => {
          const { Icon, className } = STEP_ICON[step.status];
          const href = internalHref(step.entity?.url);
          return (
            <li key={step.index} className="flex flex-col gap-s10">
              <div className="flex gap-s10">
                <Icon
                  size={20}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className={`mt-px shrink-0 ${className}`}
                />
                <div className="flex flex-col gap-s5 text-body text-ink">
                  <p>
                    <span className="font-bold">{STEP_STATUS[step.status]}.</span>{' '}
                    {step.description}
                  </p>
                  {step.error ? (
                    <p className="text-body-sm text-danger">{step.error.message}</p>
                  ) : null}
                  {href ? (
                    <Link href={href} className="text-body-sm">
                      Ver lo que se creó
                    </Link>
                  ) : null}
                </div>
              </div>
              {step.oneTimeSecret ? (
                <div className="pl-s30">
                  <OneTimeSecret
                    label={`Contraseña inicial · ${step.description}`}
                    value={step.oneTimeSecret}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
