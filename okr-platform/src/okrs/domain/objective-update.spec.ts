import { validateObjectiveUpdate } from './objective-update';
import type { Result } from '../../common/domain/result';

const code = (r: Result<unknown>) => (r.ok ? null : r.code);

describe('validateObjectiveUpdate', () => {
  it('DRAFT permite cualquier campo editable', () =>
    expect(
      validateObjectiveUpdate('DRAFT', [
        'title',
        'description',
        'type',
        'origin',
        'parentObjectiveId',
      ]).ok,
    ).toBe(true));

  it('PUBLISHED permite title, description y parentObjectiveId', () =>
    expect(
      validateObjectiveUpdate('PUBLISHED', ['title', 'description', 'parentObjectiveId']).ok,
    ).toBe(true));

  it.each(['type', 'origin'])('PUBLISHED rechaza cambiar %s', (field) =>
    expect(code(validateObjectiveUpdate('PUBLISHED', ['title', field]))).toBe(
      'OBJECTIVE_FIELD_LOCKED',
    ),
  );

  it('CLOSED rechaza todo', () =>
    expect(code(validateObjectiveUpdate('CLOSED', ['title']))).toBe('OBJECTIVE_CLOSED'));
});
