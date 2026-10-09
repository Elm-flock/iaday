import type { components } from '@/lib/api/schema';

type Cycle = components['schemas']['CycleDto'];

/** Ciclo anual en borrador con los umbrales por defecto; pisá lo que necesite el test. */
export const cycle = (over: Partial<Cycle> = {}): Cycle => ({
  id: 'x',
  name: 'x',
  kind: 'ANNUAL',
  parentId: null,
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  status: 'DRAFT',
  checkInCadence: 'WEEKLY',
  committedThreshold: 1,
  aspirationalThreshold: 0.7,
  closedAt: null,
  ...over,
});
