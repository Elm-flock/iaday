import type { components } from '@/lib/api/schema';

type Cycle = components['schemas']['CycleDto'];

export type CycleBranch = { cycle: Cycle; quarters: Cycle[] };

/** Agrupa los trimestres bajo su ciclo anual. Anuales y trimestres ordenados por inicio. */
export function buildCycleTree(cycles: Cycle[]): CycleBranch[] {
  const byStart = (a: Cycle, b: Cycle) => a.startDate.localeCompare(b.startDate);
  const annuals = cycles.filter((c) => c.kind === 'ANNUAL').sort(byStart);
  return annuals.map((annual) => ({
    cycle: annual,
    quarters: cycles.filter((c) => c.parentId === annual.id).sort(byStart),
  }));
}
