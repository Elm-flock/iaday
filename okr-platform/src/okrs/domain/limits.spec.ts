import { canAddKeyResult, canCreateObjective, validatePublish } from './limits';
import type { Result } from '../../common/domain/result';

const code = (r: Result<unknown>) => (r.ok ? null : r.code);

describe('canCreateObjective (cuenta DRAFT+ACTIVE del owner en el ciclo)', () => {
  it.each([0, 4])('permite con %p existentes', (n) => expect(canCreateObjective(n).ok).toBe(true));
  it.each([5, 6])('rechaza con %p existentes', (n) =>
    expect(code(canCreateObjective(n))).toBe('OBJECTIVE_LIMIT_EXCEEDED'),
  );
});

describe('canAddKeyResult', () => {
  it('permite con 4', () => expect(canAddKeyResult(4).ok).toBe(true));
  it('rechaza con 5', () => expect(code(canAddKeyResult(5))).toBe('KR_LIMIT_EXCEEDED'));
});

describe('validatePublish', () => {
  it('3 objetivos y 3 KRs -> ok', () =>
    expect(validatePublish({ ownerObjectiveCount: 3, krCount: 3 }).ok).toBe(true));
  it('2 KRs -> rechaza', () =>
    expect(code(validatePublish({ ownerObjectiveCount: 3, krCount: 2 }))).toBe('MIN_KRS_NOT_MET'));
  it('2 objetivos -> rechaza', () =>
    expect(code(validatePublish({ ownerObjectiveCount: 2, krCount: 3 }))).toBe(
      'MIN_OBJECTIVES_NOT_MET',
    ));
  it('5 y 5 -> ok', () =>
    expect(validatePublish({ ownerObjectiveCount: 5, krCount: 5 }).ok).toBe(true));
  it('más de 5 objetivos o KRs -> rechaza', () => {
    expect(code(validatePublish({ ownerObjectiveCount: 6, krCount: 3 }))).toBe(
      'OBJECTIVE_LIMIT_EXCEEDED',
    );
    expect(code(validatePublish({ ownerObjectiveCount: 3, krCount: 6 }))).toBe('KR_LIMIT_EXCEEDED');
  });
});
