import { BookOpen } from 'lucide-react';
import { ExecutionResult } from './execution-result';
import { PlanChecklist } from './plan-checklist';
import { QueryResultTable } from './query-result-table';
import { internalHref } from '../messages';
import { Link } from '@/components/ui/link';
import type { components } from '@/lib/api/schema';
import { cn } from '@/lib/cn';
import { formatTime } from '@/lib/format';

export type ChatMessage = components['schemas']['MessageDto'];
type Plan = components['schemas']['PlanDto'];

type Props = {
  message: ChatMessage;
  busyPlanId: string | null;
  onConfirm: (plan: Plan) => void;
  onDiscard: (plan: Plan) => void;
};

/** Burbuja con el rol escrito ("Vos" / "Asistente"): el rol nunca va solo por posición o color. */
export function MessageItem({ message, busyPlanId, onConfirm, onDiscard }: Props) {
  const mine = message.role === 'ADMIN';
  const author = mine ? 'Vos' : 'Asistente';

  return (
    <li
      data-testid="chat-message"
      data-role={message.role}
      data-kind={message.kind}
      className={cn('flex flex-col gap-s5', mine ? 'items-end' : 'items-start')}
    >
      <p className="text-caption text-ink-muted">
        <span className="font-bold text-ink">{author}</span> · {formatTime(message.createdAt)}
      </p>
      <div
        className={cn(
          'flex max-w-full flex-col gap-s10 rounded-lg border p-s15 text-body text-ink sm:max-w-[85%]',
          mine ? 'border-primary bg-primary-subtle' : 'border-border bg-surface-subtle',
          message.kind === 'PLAN' || message.kind === 'EXECUTION_RESULT' || message.query
            ? 'w-full sm:max-w-full'
            : '',
        )}
      >
        {message.kind !== 'EXECUTION_RESULT' ? (
          <p className="whitespace-pre-wrap">{message.text}</p>
        ) : null}

        {message.kind === 'PLAN' && message.plan ? (
          <PlanChecklist
            plan={message.plan}
            busy={busyPlanId === message.plan.id}
            onConfirm={onConfirm}
            onDiscard={onDiscard}
          />
        ) : null}

        {message.kind === 'EXECUTION_RESULT' && message.steps ? (
          <ExecutionResult headingId={`result-${message.id}`} steps={message.steps} />
        ) : null}

        {message.query ? <QueryResultTable query={message.query} /> : null}

        {message.citations && message.citations.length > 0 ? (
          <div className="flex flex-col gap-s5 border-t border-border pt-s10">
            <p className="flex items-center gap-s5 text-body-sm font-bold text-ink">
              <BookOpen size={16} strokeWidth={1.75} aria-hidden="true" />
              Más información en el manual
            </p>
            <ul className="flex flex-col gap-s5 text-body-sm">
              {message.citations.map((citation) => {
                const href = internalHref(citation.url);
                return (
                  <li key={citation.id}>
                    {href ? <Link href={href}>{citation.title}</Link> : citation.title}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </li>
  );
}
