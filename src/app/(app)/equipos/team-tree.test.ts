import { describe, expect, it } from 'vitest';
import { flattenTeams, originMixShares, selfAndDescendantIds } from './team-tree';

const tree = [
  {
    id: 'org',
    name: 'Flock',
    parentId: null,
    children: [
      {
        id: 'eng',
        name: 'Ingeniería',
        parentId: 'org',
        children: [{ id: 'web', name: 'Web', parentId: 'eng', children: [] }],
      },
      { id: 'ops', name: 'Operaciones', parentId: 'org', children: [] },
    ],
  },
];

describe('team-tree', () => {
  it('aplana en orden de lectura con profundidad', () => {
    expect(flattenTeams(tree).map((t) => [t.id, t.depth])).toEqual([
      ['org', 0],
      ['eng', 1],
      ['web', 2],
      ['ops', 1],
    ]);
  });

  it('un equipo y sus descendientes no son candidatos a padre', () => {
    expect([...selfAndDescendantIds(tree, 'eng')].sort()).toEqual(['eng', 'web']);
    expect(selfAndDescendantIds(tree, 'nope').size).toBe(0);
  });

  it('calcula porcentajes de la mezcla y null si no hay objetivos', () => {
    expect(originMixShares({ topDown: 1, bottomUp: 3 })).toEqual({
      total: 4,
      topDown: 0.25,
      bottomUp: 0.75,
    });
    expect(originMixShares({ topDown: 0, bottomUp: 0 })).toBeNull();
  });
});
