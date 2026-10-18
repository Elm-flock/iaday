import { Bot } from 'lucide-react';
import {
  ACTION_LABEL,
  actorLabel,
  describeChanges,
  entityLabel,
  formatWhen,
  isViaAssistant,
} from '../audit-diff';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import type { AuditEntry } from '@/lib/dal/audit';

const th = 'px-s15 py-s10 font-normal';

/** Registro de auditoría. Presentacional: recibe los nombres ya resueltos (`people`). */
export function AuditTable({
  items,
  people,
}: {
  items: AuditEntry[];
  people: ReadonlyMap<string, string>;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No hay registros con estos filtros"
        description="Probá con otro rango de fechas o quitá algún filtro."
      />
    );
  }
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[56rem] text-left text-body-sm">
        <caption className="sr-only">Registro de auditoría, del más nuevo al más viejo</caption>
        <thead>
          <tr className="border-b border-border text-ink-muted">
            <th scope="col" className={th}>
              Fecha
            </th>
            <th scope="col" className={th}>
              Quién
            </th>
            <th scope="col" className={th}>
              Acción
            </th>
            <th scope="col" className={th}>
              Elemento
            </th>
            <th scope="col" className={th}>
              Qué cambió
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => {
            const changes = describeChanges(entry, { people });
            return (
              <tr key={entry.id} className="border-b border-border align-top last:border-b-0">
                <td className="px-s15 py-s10 whitespace-nowrap tabular-nums">
                  {formatWhen(entry.createdAt)}
                </td>
                <td className="px-s15 py-s10">{actorLabel(entry.actorId, people)}</td>
                <td className="px-s15 py-s10 text-ink">
                  {ACTION_LABEL[entry.action]}
                  {isViaAssistant(entry) ? (
                    <span className="mt-s5 flex items-center gap-s5 text-caption text-ink-muted">
                      <Bot size={14} strokeWidth={1.75} aria-hidden="true" />
                      Vía asistente
                    </span>
                  ) : null}
                </td>
                <td className="px-s15 py-s10">
                  {entityLabel(entry.entityType)}
                  <span className="block text-caption text-ink-muted">
                    Código {entry.entityId.slice(0, 8)}
                  </span>
                </td>
                <td className="px-s15 py-s10">
                  {changes.length === 0 ? (
                    <span className="text-ink-muted">Sin datos para mostrar</span>
                  ) : (
                    <ul className="flex flex-col gap-s5">
                      {changes.map((c) => (
                        <li key={c.field}>
                          <span className="text-ink-muted">{c.label}: </span>
                          {c.before !== null ? (
                            <>
                              <span>{c.before}</span>
                              <span aria-hidden="true"> → </span>
                              <span className="sr-only"> pasó a </span>
                            </>
                          ) : null}
                          <span className="font-bold text-ink">{c.after ?? 'Sin dato'}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
