import { CalendarRange } from 'lucide-react';
import type { ReactNode } from 'react';
import { buildCycleTree } from '../cycle-tree';
import { CycleStatusBadge } from './cycle-status-badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Link } from '@/components/ui/link';
import type { components } from '@/lib/api/schema';
import { formatDate } from '@/lib/format';

type Cycle = components['schemas']['CycleDto'];

function CycleRow({ cycle, nested = false }: { cycle: Cycle; nested?: boolean }) {
  return (
    <li
      className={
        nested
          ? 'flex flex-wrap items-center justify-between gap-s10 border-t border-border py-s10 pl-s30'
          : 'flex flex-wrap items-center justify-between gap-s10 py-s10'
      }
    >
      <div className="flex flex-col">
        <Link href={`/ciclos/${cycle.id}`} className={nested ? '' : 'font-bold'}>
          {cycle.name}
        </Link>
        <span className="text-body-sm text-ink-muted">
          {formatDate(cycle.startDate)} al {formatDate(cycle.endDate)}
        </span>
      </div>
      <CycleStatusBadge status={cycle.status} />
    </li>
  );
}

/** Lista de ciclos anuales con sus trimestres. Presentacional: recibe los datos ya cargados. */
export function CyclesTreeView({
  cycles,
  emptyAction,
}: {
  cycles: Cycle[];
  /** Acción sugerida cuando no hay ciclos (solo para quien puede crearlos). */
  emptyAction?: ReactNode;
}) {
  const tree = buildCycleTree(cycles);

  if (tree.length === 0) {
    return (
      <EmptyState
        icon={<CalendarRange size={32} strokeWidth={1.75} aria-hidden="true" />}
        title="Todavía no hay ciclos"
        description="Un ciclo anual agrupa los trimestres en los que se publican y siguen los objetivos."
        action={emptyAction}
      />
    );
  }

  return (
    <div className="flex flex-col gap-s20">
      {tree.map(({ cycle, quarters }) => (
        <Card key={cycle.id} aria-label={cycle.name}>
          <ul>
            <CycleRow cycle={cycle} />
            {quarters.length === 0 ? (
              <li className="border-t border-border py-s10 pl-s30 text-body-sm text-ink-muted">
                Este ciclo anual todavía no tiene trimestres.
              </li>
            ) : (
              quarters.map((q) => <CycleRow key={q.id} cycle={q} nested />)
            )}
          </ul>
        </Card>
      ))}
    </div>
  );
}
