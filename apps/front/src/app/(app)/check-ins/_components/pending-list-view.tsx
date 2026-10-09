import { CircleCheck } from 'lucide-react';
import NextLink from 'next/link';
import { RegisterCheckInButton } from './register-check-in-button';
import type { CheckInTarget } from './check-in-target';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { OverdueBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/format';

export type PendingItem = {
  target: CheckInTarget;
  cadence: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  lastCheckInAt: string | null;
  referenceAt: string;
};

export type PendingGroup = { objectiveId: string; objectiveTitle: string; items: PendingItem[] };

const CADENCE_LABEL = { WEEKLY: 'semanal', BIWEEKLY: 'quincenal', MONTHLY: 'mensual' } as const;

/** Agrupa los KRs vencidos por objetivo, en el orden en que aparece cada objetivo. */
export function groupByObjective(
  items: (PendingItem & { objectiveId: string; objectiveTitle: string })[],
): PendingGroup[] {
  const groups = new Map<string, PendingGroup>();
  for (const { objectiveId, objectiveTitle, ...item } of items) {
    const group = groups.get(objectiveId) ?? { objectiveId, objectiveTitle, items: [] };
    group.items.push(item);
    groups.set(objectiveId, group);
  }
  return [...groups.values()];
}

/** Pendientes de check-in agrupados por objetivo. Presentacional. */
export function PendingListView({ groups }: { groups: PendingGroup[] }) {
  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<CircleCheck size={32} strokeWidth={1.75} aria-hidden="true" />}
        title="Estás al día con tus check-ins."
        description="Cuando un resultado clave pase su cadencia sin avances, lo vas a ver acá."
      />
    );
  }
  return (
    <div className="flex flex-col gap-s20">
      {groups.map((group) => (
        <Card
          key={group.objectiveId}
          title={group.objectiveTitle}
          actions={
            <NextLink
              href={`/objetivos/${group.objectiveId}`}
              className="text-body-sm text-primary-text underline underline-offset-2"
            >
              Ver objetivo
            </NextLink>
          }
        >
          <ul className="flex flex-col gap-s10">
            {group.items.map((item) => (
              <li
                key={item.target.krId}
                className="flex flex-wrap items-center justify-between gap-s15 rounded-md border border-border bg-surface p-s15"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-s5">
                  <span className="text-body font-bold text-ink">{item.target.title}</span>
                  <span className="text-body-sm text-ink-muted">
                    {item.lastCheckInAt
                      ? `Último check-in: ${formatDate(item.lastCheckInAt)}`
                      : `Sin check-ins desde la publicación (${formatDate(item.referenceAt)})`}
                    {' · '}Cadencia {CADENCE_LABEL[item.cadence]}
                  </span>
                </div>
                <OverdueBadge />
                <RegisterCheckInButton target={item.target} />
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
