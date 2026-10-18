import type { ReactNode } from 'react';
import { FEATURE_LABEL, NO_DATA, formatCostUsd, formatMs, formatRatio, labelOf } from '../messages';
import { Card } from '@/components/ui/card';
import type { AiImpact } from '@/lib/dal/ai';
import { formatNumber } from '@/lib/format';

function Tile({ label, value, hint }: { label: string; value: string; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-s5 rounded-md border border-border p-s15">
      <dt className="text-body-sm text-ink-muted">{label}</dt>
      <dd className="text-heading-3 font-light text-ink tabular-nums">{value}</dd>
      {hint ? <dd className="text-caption text-ink-muted">{hint}</dd> : null}
    </div>
  );
}

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <Card title={title}>
    <dl className="grid grid-cols-1 gap-s15 sm:grid-cols-2 xl:grid-cols-3">{children}</dl>
  </Card>
);

/** Métricas de impacto del uso de la IA (RD 707/2026 art. 14.5). Solo agregados: sin rankings ni personas. */
export function ImpactTiles({ impact }: { impact: AiImpact }) {
  const { adoption, time, quality, cost } = impact;
  return (
    <div className="flex flex-col gap-s20">
      <Group title="Adopción">
        <Tile
          label="Versiones accesibles que sirvieron"
          value={formatRatio(adoption.adaptationAcceptanceRate)}
          hint={`${formatNumber(adoption.adaptationsAccepted, 0)} de ${formatNumber(adoption.adaptationsTotal, 0)} (aceptadas o validadas)`}
        />
        <Tile
          label="Sugerencias aceptadas"
          value={formatRatio(adoption.suggestionAcceptanceRate)}
          hint={`${formatNumber(adoption.suggestionsAccepted, 0)} de ${formatNumber(adoption.suggestionsTotal, 0)}`}
        />
      </Group>
      <Group title="Tiempo">
        <Tile
          label="Tiempo de entrega de una versión accesible (mediana)"
          value={formatMs(time.adaptationLatencyP50Ms)}
        />
        <Tile
          label="Tiempo hasta decidir una sugerencia (mediana)"
          value={formatMs(time.decisionTimeP50Ms)}
        />
      </Group>
      <Group title="Calidad">
        <Tile
          label="Mejora media de legibilidad"
          value={
            quality.meanReadabilityDelta === null
              ? NO_DATA
              : `${formatNumber(quality.meanReadabilityDelta, 1)} puntos`
          }
          hint="Índice de Szigriszt-Pazos, texto original frente a versión adaptada"
        />
        <Tile
          label="Versiones que requirieron revisión humana"
          value={formatRatio(quality.needsReviewRate)}
        />
      </Group>
      <Group title="Costo (estimado)">
        <Tile label="Costo total estimado" value={formatCostUsd(cost.totalCostUsdEst)} />
        <Tile
          label="Personas que usaron la IA"
          value={formatNumber(cost.activeUsers, 0)}
          hint="Solo el conteo, sin nombres"
        />
        <Tile
          label="Costo estimado por persona usuaria"
          value={
            cost.costPerActiveUserUsdEst === null
              ? NO_DATA
              : formatCostUsd(cost.costPerActiveUserUsdEst)
          }
        />
        {cost.byFeature.map((f) => (
          <Tile
            key={f.feature}
            label={`Costo estimado: ${labelOf(FEATURE_LABEL, f.feature)}`}
            value={formatCostUsd(f.costUsdEst)}
          />
        ))}
      </Group>
    </div>
  );
}
