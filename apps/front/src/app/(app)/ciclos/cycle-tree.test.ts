import { describe, expect, it } from 'vitest';
import { cycle } from '../../../../test/factories';
import { buildCycleTree } from './cycle-tree';

describe('buildCycleTree', () => {
  it('agrupa trimestres bajo su anual, ordenados por inicio', () => {
    const tree = buildCycleTree([
      cycle({ id: 'q2', kind: 'QUARTER', parentId: 'a26', startDate: '2026-04-01' }),
      cycle({ id: 'a27', startDate: '2027-01-01' }),
      cycle({ id: 'a26' }),
      cycle({ id: 'q1', kind: 'QUARTER', parentId: 'a26', startDate: '2026-01-01' }),
    ]);
    expect(tree.map((b) => b.cycle.id)).toEqual(['a26', 'a27']);
    expect(tree[0].quarters.map((q) => q.id)).toEqual(['q1', 'q2']);
    expect(tree[1].quarters).toEqual([]);
  });

  it('sin ciclos devuelve un árbol vacío', () => {
    expect(buildCycleTree([])).toEqual([]);
  });
});
