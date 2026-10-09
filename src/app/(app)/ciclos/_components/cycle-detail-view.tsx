import { CADENCE_LABEL, CYCLE_KIND_LABEL } from '../messages';
import { CycleStatusBadge } from './cycle-status-badge';
import { Card } from '@/components/ui/card';
import { Link } from '@/components/ui/link';
import type { components } from '@/lib/api/schema';
import { formatDate, formatDateTime, formatScore } from '@/lib/format';

type Cycle = components['schemas']['CycleDto'];

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-s5">
      <dt className="text-body-sm text-ink-muted">{label}</dt>
      <dd className="text-body text-ink">{children}</dd>
    </div>
  );
}

/** Datos del ciclo y, si es anual, sus trimestres. Presentacional. */
export function CycleDetailView({ cycle, quarters }: { cycle: Cycle; quarters: Cycle[] }) {
  return (
    <div className="flex flex-col gap-s20">
      <Card title="Datos del ciclo">
        <dl className="grid grid-cols-1 gap-s20 sm:grid-cols-2 lg:grid-cols-3">
          <Item label="Estado">
            <CycleStatusBadge status={cycle.status} />
          </Item>
          <Item label="Tipo">{CYCLE_KIND_LABEL[cycle.kind]}</Item>
          <Item label="Cadencia de check-in">{CADENCE_LABEL[cycle.checkInCadence]}</Item>
          <Item label="Inicio">{formatDate(cycle.startDate)}</Item>
          <Item label="Fin">{formatDate(cycle.endDate)}</Item>
          {cycle.closedAt ? <Item label="Cerrado el">{formatDateTime(cycle.closedAt)}</Item> : null}
        </dl>
      </Card>

      <Card title="Umbrales de logro">
        <dl className="grid grid-cols-1 gap-s20 sm:grid-cols-2">
          <Item label="Objetivos comprometidos">
            <span data-testid="committed-threshold">{formatScore(cycle.committedThreshold)}</span>
          </Item>
          <Item label="Objetivos aspiracionales">
            <span data-testid="aspirational-threshold">
              {formatScore(cycle.aspirationalThreshold)}
            </span>
          </Item>
        </dl>
        <p className="mt-s15 text-body-sm text-ink-muted">
          Un objetivo se considera logrado cuando su puntaje final alcanza el umbral de su tipo.
          {cycle.status === 'CLOSED'
            ? ' Estos umbrales ya no se pueden cambiar.'
            : ' Podés ajustarlos hasta que el ciclo se cierre.'}
        </p>
      </Card>

      {cycle.kind === 'ANNUAL' ? (
        <Card title="Trimestres">
          {quarters.length === 0 ? (
            <p className="text-body text-ink-muted">
              Este ciclo anual todavía no tiene trimestres.
            </p>
          ) : (
            <ul className="flex flex-col">
              {quarters.map((q) => (
                <li
                  key={q.id}
                  className="flex flex-wrap items-center justify-between gap-s10 border-t border-border py-s10 first:border-t-0 first:pt-0"
                >
                  <div className="flex flex-col">
                    <Link href={`/ciclos/${q.id}`}>{q.name}</Link>
                    <span className="text-body-sm text-ink-muted">
                      {formatDate(q.startDate)} al {formatDate(q.endDate)}
                    </span>
                  </div>
                  <CycleStatusBadge status={q.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}
