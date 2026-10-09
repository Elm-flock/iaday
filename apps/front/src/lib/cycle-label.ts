import { formatDate } from './format';

/** `dd/mm` de una fecha `YYYY-MM-DD` (formato AR sin año). */
function dayMonth(date: string): string {
  return formatDate(date).slice(0, 5);
}

/** Etiqueta corta para selectores: `Q1 2026 · 01/01–31/03` (cabe sin truncarse en un select). */
export function cycleLabel(cycle: { name: string; startDate: string; endDate: string }): string {
  return `${cycle.name} · ${dayMonth(cycle.startDate)}–${dayMonth(cycle.endDate)}`;
}
