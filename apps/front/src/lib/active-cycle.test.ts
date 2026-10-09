import { describe, expect, it } from 'vitest';
import { pickDashboardCycle } from './active-cycle';
import { cycle } from '../../test/factories';

const annual = cycle({ id: 'a', kind: 'ANNUAL', status: 'ACTIVE' });
const q1 = cycle({
  id: 'q1',
  kind: 'QUARTER',
  status: 'ACTIVE',
  startDate: '2026-01-01',
  endDate: '2026-03-31',
});
const q4 = cycle({
  id: 'q4',
  kind: 'QUARTER',
  status: 'ACTIVE',
  startDate: '2026-10-01',
  endDate: '2026-12-31',
});

describe('pickDashboardCycle', () => {
  it('respeta el ciclo pedido si existe', () => {
    expect(pickDashboardCycle([annual, q1, q4], 'q1', '2026-10-09')?.id).toBe('q1');
  });
  it('ignora un id inexistente y cae al por defecto', () => {
    expect(pickDashboardCycle([annual, q1, q4], 'zzz', '2026-10-09')?.id).toBe('q4');
  });
  it('prefiere el trimestre activo que contiene hoy', () => {
    expect(pickDashboardCycle([annual, q1, q4], undefined, '2026-10-09')?.id).toBe('q4');
  });
  it('sin trimestre vigente hoy usa el primer trimestre activo, y si no el anual activo', () => {
    expect(pickDashboardCycle([annual, q1], undefined, '2026-10-09')?.id).toBe('q1');
    expect(pickDashboardCycle([annual], undefined, '2026-10-09')?.id).toBe('a');
  });
  it('sin ciclos activos no hay ciclo', () => {
    expect(
      pickDashboardCycle([cycle({ id: 'd', status: 'DRAFT' })], undefined, '2026-10-09'),
    ).toBeUndefined();
  });
});
