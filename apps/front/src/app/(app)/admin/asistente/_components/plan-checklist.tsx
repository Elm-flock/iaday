'use client';

import {
  Ban,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { ISSUE_TITLE, PLAN_STATUS_LABEL } from '../messages';
import { Button } from '@/components/ui/button';
import type { components } from '@/lib/api/schema';
import { formatTime } from '@/lib/format';

type Plan = components['schemas']['PlanDto'];
type Issue = components['schemas']['PlanIssueDto'];

const STATUS_ICON: Record<string, LucideIcon> = {
  PROPOSED: Clock,
  INVALID: CircleAlert,
  EXECUTING: Clock,
  EXECUTED: CircleCheck,
  PARTIAL: TriangleAlert,
  FAILED: CircleX,
  INTERRUPTED: TriangleAlert,
  DISCARDED: Ban,
  EXPIRED: Clock,
};

/** Reloj en el cliente (null en el servidor y en la primera pintura: sin diferencias de hidratación). */
function useNow(intervalMs: number, enabled: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}

export function minutesLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60_000));
}

function IssueList({ items, tone }: { items: Issue[]; tone: 'danger' | 'warning' }) {
  if (items.length === 0) return null;
  const Icon = tone === 'danger' ? CircleAlert : TriangleAlert;
  const label =
    tone === 'danger' ? 'Problemas que impiden ejecutar' : 'Avisos para tener en cuenta';
  return (
    <div className="flex flex-col gap-s5">
      <p className="text-body-sm font-bold text-ink">{label}</p>
      <ul className="flex flex-col gap-s5">
        {items.map((issue, i) => (
          <li key={`${issue.code}-${i}`} className="flex gap-s10 text-body-sm text-ink">
            <Icon
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className={
                tone === 'danger' ? 'mt-px shrink-0 text-danger' : 'mt-px shrink-0 text-warning'
              }
            />
            <span>
              {ISSUE_TITLE[issue.code] ? (
                <span className="font-bold">{ISSUE_TITLE[issue.code]}: </span>
              ) : null}
              {issue.message}
              {issue.actionIndex !== null ? ` (paso ${issue.actionIndex + 1})` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Props = {
  plan: Plan;
  /** Hay una confirmación o un descarte en curso (de este plan). */
  busy: boolean;
  onConfirm: (plan: Plan) => void;
  onDiscard: (plan: Plan) => void;
};

/**
 * Plan propuesto por el asistente: lista de acciones en orden, supuestos, avisos y problemas.
 * "Confirmar y ejecutar" envía el `planHash` que se ve acá. Nada se ejecuta hasta ese botón.
 */
export function PlanChecklist({ plan, busy, onConfirm, onDiscard }: Props) {
  const proposed = plan.status === 'PROPOSED';
  const now = useNow(1000, proposed);
  const expired = proposed && now !== null && Date.parse(plan.expiresAt) <= now;
  const hasIssues = plan.issues.length > 0 || plan.status === 'INVALID';
  const effectiveStatus = expired ? 'EXPIRED' : plan.status;
  const StatusIcon = STATUS_ICON[effectiveStatus] ?? Clock;
  const canConfirm = proposed && !expired && !hasIssues && !busy;
  const reasonId = `plan-${plan.id}-reason`;

  let reason: string | null = null;
  if (expired) reason = 'El plan venció. Pedilo de nuevo para generar uno nuevo.';
  else if (proposed && hasIssues) {
    reason = 'No se puede confirmar mientras haya problemas. Pedilo de nuevo con más detalle.';
  }

  return (
    <div
      data-testid="plan-checklist"
      className="flex flex-col gap-s15 rounded-lg border border-border bg-surface p-s15"
    >
      <div className="flex flex-wrap items-start justify-between gap-s10">
        <h4
          id={`plan-${plan.id}`}
          tabIndex={-1}
          className="text-heading-3 font-light tracking-heading text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Plan propuesto: {plan.summary}
        </h4>
        <span className="inline-flex items-center gap-s5 rounded-pill border border-border bg-surface-subtle px-s10 py-s5 text-caption text-ink">
          <StatusIcon size={14} strokeWidth={1.75} aria-hidden="true" />
          {PLAN_STATUS_LABEL[effectiveStatus] ?? effectiveStatus}
        </span>
      </div>

      <div>
        <p className="mb-s5 text-body-sm font-bold text-ink">Qué voy a hacer, en este orden</p>
        <ol className="flex list-decimal flex-col gap-s5 pl-s20 text-body text-ink">
          {plan.actions.map((action) => (
            <li key={action.index}>{action.description}</li>
          ))}
        </ol>
      </div>

      {plan.assumptions.length > 0 ? (
        <div>
          <p className="mb-s5 text-body-sm font-bold text-ink">Supuestos que tomé</p>
          <ul className="flex list-disc flex-col gap-s5 pl-s20 text-body-sm text-ink">
            {plan.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <IssueList items={plan.issues} tone="danger" />
      <IssueList items={plan.warnings} tone="warning" />

      {proposed ? (
        <div className="flex flex-col gap-s10">
          <p className="text-body-sm text-ink-muted">
            {now === null
              ? `Vence a las ${formatTime(plan.expiresAt)}.`
              : expired
                ? 'Venció.'
                : `Vence a las ${formatTime(plan.expiresAt)} (en ${minutesLeft(plan.expiresAt, now)} min).`}{' '}
            Hasta que confirmes, no se hace ningún cambio.
          </p>
          <div className="flex flex-wrap items-center gap-s10">
            <Button
              disabled={!canConfirm}
              loading={busy}
              aria-describedby={reason ? reasonId : undefined}
              onClick={() => onConfirm(plan)}
            >
              Confirmar y ejecutar
            </Button>
            <Button variant="secondary" disabled={busy || expired} onClick={() => onDiscard(plan)}>
              Descartar
            </Button>
          </div>
          {reason ? (
            <p id={reasonId} className="text-body-sm text-ink-muted">
              {reason}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
