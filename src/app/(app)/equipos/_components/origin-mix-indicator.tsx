import { originMixShares } from '../team-tree';
import { StatusBadge } from '@/components/ui/status-badge';
import type { components } from '@/lib/api/schema';
import { formatPercent } from '@/lib/format';

type OriginMix = components['schemas']['OriginMixDto'];

/**
 * Indicador 50/50 de objetivos top-down vs. bottom-up. Fuera de 40–60 % es un aviso suave
 * (ícono + palabra): nunca bloquea nada. `mix` es lo que informa la API, sin recalcular.
 */
export function OriginMixIndicator({ mix }: { mix: OriginMix | null }) {
  if (mix === null) {
    return (
      <p className="text-body text-ink-muted">
        Elegí un ciclo para ver cómo se reparten entre top-down y bottom-up los objetivos del equipo
        y los individuales de sus integrantes.
      </p>
    );
  }

  const shares = originMixShares(mix);
  if (shares === null) {
    return (
      <p className="text-body text-ink-muted">
        Todavía no hay objetivos en este ciclo, ni del equipo ni individuales de sus integrantes,
        así que no hay mezcla para mostrar. La mezcla cuenta ambos tipos.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-s15" data-testid="origin-mix">
      <div className="flex flex-wrap items-center gap-s10">
        {mix.warning ? (
          <StatusBadge tone="warning">Fuera del rango 40–60 %</StatusBadge>
        ) : (
          <StatusBadge tone="success">Equilibrado</StatusBadge>
        )}
        <span className="text-body-sm text-ink-muted">
          Lo ideal es que ambos orígenes estén entre 40 % y 60 %.
        </span>
      </div>

      <div
        role="img"
        aria-label={`Top-down ${formatPercent(shares.topDown)}, bottom-up ${formatPercent(shares.bottomUp)}`}
        className="flex h-3 w-full overflow-hidden rounded-pill bg-surface-subtle"
      >
        <div className="h-full bg-primary" style={{ width: `${shares.topDown * 100}%` }} />
        <div className="h-full bg-accent" style={{ width: `${shares.bottomUp * 100}%` }} />
      </div>

      <dl className="grid grid-cols-2 gap-s15">
        <div className="flex flex-col gap-s5">
          <dt className="text-body-sm text-ink-muted">Top-down</dt>
          <dd className="text-body text-ink">
            {formatPercent(shares.topDown)} · {mix.topDown}{' '}
            {mix.topDown === 1 ? 'objetivo' : 'objetivos'}
          </dd>
        </div>
        <div className="flex flex-col gap-s5">
          <dt className="text-body-sm text-ink-muted">Bottom-up</dt>
          <dd className="text-body text-ink">
            {formatPercent(shares.bottomUp)} · {mix.bottomUp}{' '}
            {mix.bottomUp === 1 ? 'objetivo' : 'objetivos'}
          </dd>
        </div>
      </dl>

      {mix.warning ? (
        <p className="text-body-sm text-ink">
          Es solo un aviso: podés seguir trabajando con esta mezcla, pero conviene revisar si los
          objetivos nacen tanto de la dirección como de las personas del equipo.
        </p>
      ) : null}
    </div>
  );
}
