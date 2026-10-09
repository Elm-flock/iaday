import { validateAlignment } from './alignment';
import type { Result } from '../../common/domain/result';

const code = (r: Result<unknown>) => (r.ok ? null : r.code);

describe('validateAlignment (REQ-ALN-1)', () => {
  it('padre PUBLISHED sin ancestros -> ok', () =>
    expect(
      validateAlignment({
        objectiveId: 'a',
        parentId: 'b',
        parentStatus: 'PUBLISHED',
        parentAncestorIds: [],
      }).ok,
    ).toBe(true));

  it('al crear (sin objectiveId) con padre PUBLISHED -> ok', () =>
    expect(
      validateAlignment({ parentId: 'b', parentStatus: 'PUBLISHED', parentAncestorIds: ['c'] }).ok,
    ).toBe(true));

  it('auto-referencia -> ALIGNMENT_SELF_PARENT', () =>
    expect(
      code(
        validateAlignment({
          objectiveId: 'a',
          parentId: 'a',
          parentStatus: 'PUBLISHED',
          parentAncestorIds: [],
        }),
      ),
    ).toBe('ALIGNMENT_SELF_PARENT'));

  it('A->B y luego B->A (A es ancestro del nuevo padre) -> ALIGNMENT_CYCLE', () =>
    expect(
      code(
        validateAlignment({
          objectiveId: 'b',
          parentId: 'a',
          parentStatus: 'PUBLISHED',
          parentAncestorIds: ['b'],
        }),
      ),
    ).toBe('ALIGNMENT_CYCLE'));

  it('ciclo indirecto A->B->C y C->A -> ALIGNMENT_CYCLE', () =>
    expect(
      code(
        validateAlignment({
          objectiveId: 'c',
          parentId: 'a',
          parentStatus: 'PUBLISHED',
          parentAncestorIds: ['b', 'c'],
        }),
      ),
    ).toBe('ALIGNMENT_CYCLE'));

  it.each(['DRAFT', 'CLOSED'] as const)('padre %s -> ALIGNMENT_PARENT_NOT_PUBLISHED', (status) =>
    expect(
      code(
        validateAlignment({
          objectiveId: 'a',
          parentId: 'b',
          parentStatus: status,
          parentAncestorIds: [],
        }),
      ),
    ).toBe('ALIGNMENT_PARENT_NOT_PUBLISHED'),
  );

  it('un ciclo se reporta antes que el estado del padre', () =>
    expect(
      code(
        validateAlignment({
          objectiveId: 'b',
          parentId: 'a',
          parentStatus: 'DRAFT',
          parentAncestorIds: ['b'],
        }),
      ),
    ).toBe('ALIGNMENT_CYCLE'));
});
