import { CircleCheck } from 'lucide-react';
import NextLink from 'next/link';
import { buttonStyles } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { OverdueBadge } from '@/components/ui/status-badge';
import type { PendingCheckIn } from '@/lib/dal/check-ins';

/** "Check-ins pendientes": cantidad + los primeros KRs vencidos. Con pendientes, su enlace es LA acción primaria. */
export function PendingCard({ total, top }: { total: number; top: PendingCheckIn[] }) {
  if (total === 0) {
    return (
      <Card title="Check-ins pendientes" aria-label="Check-ins pendientes">
        <EmptyState
          icon={<CircleCheck size={32} strokeWidth={1.75} aria-hidden="true" />}
          title="Estás al día con tus check-ins."
          description="Cuando un resultado clave pase su cadencia sin avances, lo vas a ver acá."
        />
      </Card>
    );
  }
  return (
    <Card
      title="Check-ins pendientes"
      aria-label="Check-ins pendientes"
      actions={
        <span className="text-body-sm text-ink" data-testid="pending-count">
          {total} {total === 1 ? 'vencido' : 'vencidos'}
        </span>
      }
    >
      <ul className="flex flex-col gap-s10">
        {top.map((p) => (
          <li key={p.keyResultId}>
            <NextLink
              href={`/objetivos/${p.objectiveId}`}
              className="flex flex-col gap-s5 rounded-md border border-border bg-surface p-s10 transition-colors duration-150 hover:border-border-strong hover:bg-surface-subtle"
            >
              <span className="text-body font-bold text-ink">{p.keyResultTitle}</span>
              <span className="text-body-sm text-ink-muted">{p.objectiveTitle}</span>
              <span>
                <OverdueBadge />
              </span>
            </NextLink>
          </li>
        ))}
      </ul>
      {total > top.length ? (
        <p className="mt-s10 text-body-sm text-ink-muted">
          Y {total - top.length} más en la lista completa.
        </p>
      ) : null}
      <div className="mt-s15">
        <NextLink href="/check-ins" className={buttonStyles({})}>
          Registrar check-in
        </NextLink>
      </div>
    </Card>
  );
}
