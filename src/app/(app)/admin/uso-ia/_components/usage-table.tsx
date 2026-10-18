import {
  COST_NOTE,
  ERROR_CODE_LABEL,
  FEATURE_LABEL,
  STEP_LABEL,
  formatCostUsd,
  formatMs,
  formatRatio,
  labelOf,
} from '../messages';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import type { AiUsage } from '@/lib/dal/ai';
import { formatNumber } from '@/lib/format';

type Row = AiUsage['byFeature'][number];

const th = 'px-s15 py-s10 font-normal';
const num = 'tabular-nums text-right';

/** Uso agregado por feature o por modelo. Sin datos por persona. Presentacional. */
export function UsageTable({
  title,
  keyHeader,
  rows,
  humanizeKey = false,
}: {
  title: string;
  keyHeader: string;
  rows: Row[];
  /** `true` para features (traduce el código); los modelos se muestran tal cual. */
  humanizeKey?: boolean;
}) {
  return (
    <Card title={title} className="overflow-x-auto">
      {rows.length === 0 ? (
        <EmptyState
          title="Sin uso en este período"
          description="Todavía no hubo llamadas a la IA."
        />
      ) : (
        <table className="w-full min-w-[56rem] text-left text-body-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b border-border text-ink-muted">
              <th scope="col" className={th}>
                {keyHeader}
              </th>
              <th scope="col" className={`${th} ${num}`}>
                Llamadas
              </th>
              <th scope="col" className={`${th} ${num}`}>
                Fallidas
              </th>
              <th scope="col" className={`${th} ${num}`}>
                Tokens de entrada
              </th>
              <th scope="col" className={`${th} ${num}`}>
                Tokens de salida
              </th>
              <th scope="col" className={`${th} ${num}`}>
                Costo estimado
              </th>
              <th scope="col" className={`${th} ${num}`}>
                Latencia p50
              </th>
              <th scope="col" className={`${th} ${num}`}>
                Latencia p95
              </th>
              <th scope="col" className={`${th} ${num}`}>
                Con modelo de respaldo
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border last:border-b-0">
                <th scope="row" className="px-s15 py-s10 font-normal text-ink">
                  {humanizeKey ? labelOf(FEATURE_LABEL, r.key) : r.key}
                </th>
                <td className={`px-s15 py-s10 ${num}`}>{formatNumber(r.calls, 0)}</td>
                <td className={`px-s15 py-s10 ${num}`}>{formatNumber(r.failedCalls, 0)}</td>
                <td className={`px-s15 py-s10 ${num}`}>{formatNumber(r.inputTokens, 0)}</td>
                <td className={`px-s15 py-s10 ${num}`}>{formatNumber(r.outputTokens, 0)}</td>
                <td className={`px-s15 py-s10 ${num}`}>{formatCostUsd(r.costUsdEst)}</td>
                <td className={`px-s15 py-s10 ${num}`}>{formatMs(r.latencyP50Ms)}</td>
                <td className={`px-s15 py-s10 ${num}`}>{formatMs(r.latencyP95Ms)}</td>
                <td className={`px-s15 py-s10 ${num}`}>{formatRatio(r.fallbackRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-s15 text-caption text-ink-muted">{COST_NOTE}</p>
    </Card>
  );
}

/** Fallos por paso del flujo y código de error. */
export function FailuresTable({ failures }: { failures: AiUsage['failures'] }) {
  return (
    <Card title="Fallos por paso" className="overflow-x-auto">
      {failures.length === 0 ? (
        <EmptyState title="Sin fallos en este período" description="Ninguna llamada falló." />
      ) : (
        <table className="w-full text-left text-body-sm">
          <caption className="sr-only">Fallos por paso del flujo y código de error</caption>
          <thead>
            <tr className="border-b border-border text-ink-muted">
              <th scope="col" className={th}>
                Paso
              </th>
              <th scope="col" className={th}>
                Motivo
              </th>
              <th scope="col" className={`${th} ${num}`}>
                Cantidad
              </th>
            </tr>
          </thead>
          <tbody>
            {failures.map((f) => (
              <tr
                key={`${f.step}-${f.errorCode ?? 'sin-codigo'}`}
                className="border-b border-border last:border-b-0"
              >
                <th scope="row" className="px-s15 py-s10 font-normal text-ink">
                  {labelOf(STEP_LABEL, f.step)}
                </th>
                <td className="px-s15 py-s10 text-ink">
                  {f.errorCode ? labelOf(ERROR_CODE_LABEL, f.errorCode) : 'Sin código'}
                </td>
                <td className={`px-s15 py-s10 ${num}`}>{formatNumber(f.count, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
