import { err, ok, type Result } from '../../common/domain/result';

export type CycleKind = 'ANNUAL' | 'QUARTER';
export type CycleStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';

export interface CycleRange {
  start: Date;
  end: Date;
}

/**
 * ANNUAL sin padre; QUARTER hijo de un ANNUAL, contenido en sus fechas y sin
 * solaparse con QUARTERs hermanos (fechas inclusivas).
 */
export function validateCycleHierarchy(
  cycle: CycleRange & { kind: CycleKind },
  parent?: CycleRange & { kind: CycleKind; status?: CycleStatus },
  siblings: CycleRange[] = [],
): Result<void> {
  if (cycle.start.getTime() >= cycle.end.getTime())
    return err('INVALID_DATE_RANGE', 'La fecha de inicio debe ser anterior a la de fin');

  if (cycle.kind === 'ANNUAL')
    return parent ? err('ANNUAL_CANNOT_HAVE_PARENT', 'Un ciclo ANNUAL no puede tener padre') : ok();

  if (!parent || parent.kind !== 'ANNUAL')
    return err('QUARTER_REQUIRES_ANNUAL_PARENT', 'Un QUARTER requiere un ciclo ANNUAL como padre');

  if (cycle.start.getTime() < parent.start.getTime() || cycle.end.getTime() > parent.end.getTime())
    return err(
      'QUARTER_OUT_OF_PARENT_RANGE',
      'El QUARTER debe estar contenido en las fechas de su ANNUAL',
    );

  const overlaps = siblings.some(
    (s) => cycle.start.getTime() <= s.end.getTime() && s.start.getTime() <= cycle.end.getTime(),
  );
  return overlaps
    ? err('QUARTER_OVERLAPS_SIBLING', 'El QUARTER se solapa con otro QUARTER del mismo ANNUAL')
    : ok();
}

const NEXT: Record<CycleStatus, CycleStatus | null> = {
  DRAFT: 'ACTIVE',
  ACTIVE: 'CLOSED',
  CLOSED: null,
};

/** Solo DRAFT -> ACTIVE -> CLOSED. */
export function canTransitionCycle(from: CycleStatus, to: CycleStatus): Result<void> {
  return NEXT[from] === to
    ? ok()
    : err('INVALID_CYCLE_TRANSITION', `Transición inválida: ${from} -> ${to}`);
}

/** Umbrales en el rango (0,1]. */
export function validateThresholds(t: { committed: number; aspirational: number }): Result<void> {
  const valid = (n: number) => Number.isFinite(n) && n > 0 && n <= 1;
  return valid(t.committed) && valid(t.aspirational)
    ? ok()
    : err('INVALID_THRESHOLD', 'Los umbrales deben estar en el rango (0, 1]');
}
