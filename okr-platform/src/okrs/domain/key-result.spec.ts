import { decimalEquals, validateKrDefinition } from './key-result';
import type { Result } from '../../common/domain/result';

const code = (r: Result<unknown>) => (r.ok ? null : r.code);

describe('decimalEquals', () => {
  it.each([
    ['100', '100'],
    ['100', '100.0000'],
    ['100.50', '100.5'],
    ['-3', '-3.0'],
    ['0', '-0'],
    ['12345678901234.1234', '12345678901234.1234'],
  ])('%s == %s', (a, b) => expect(decimalEquals(a, b)).toBe(true));

  it.each([
    ['100', '100.0001'],
    ['-3', '3'],
    ['12345678901234.1234', '12345678901234.1235'],
  ])('%s != %s', (a, b) => expect(decimalEquals(a, b)).toBe(false));
});

describe('validateKrDefinition (REQ-OKR-3)', () => {
  it('DERIVED con start y target distintos -> ok', () =>
    expect(validateKrDefinition({ scoring: 'DERIVED', start: '0', target: '100' }).ok).toBe(true));

  it('DERIVED con target < start (métrica a la baja) -> ok', () =>
    expect(validateKrDefinition({ scoring: 'DERIVED', start: '100', target: '60' }).ok).toBe(true));

  it('DERIVED con start == target (aunque con distinto formato) -> INVALID_KR_RANGE', () => {
    expect(code(validateKrDefinition({ scoring: 'DERIVED', start: '100', target: '100' }))).toBe(
      'INVALID_KR_RANGE',
    );
    expect(code(validateKrDefinition({ scoring: 'DERIVED', start: '100', target: '100.00' }))).toBe(
      'INVALID_KR_RANGE',
    );
  });

  it.each([
    [undefined, '10'],
    ['10', undefined],
    [null, null],
  ])('DERIVED sin start/target (%p, %p) -> KR_VALUES_REQUIRED', (start, target) =>
    expect(code(validateKrDefinition({ scoring: 'DERIVED', start, target }))).toBe(
      'KR_VALUES_REQUIRED',
    ),
  );

  it('MANUAL (binario) sin valores -> ok', () =>
    expect(validateKrDefinition({ scoring: 'MANUAL' }).ok).toBe(true));

  it('MANUAL con start o target -> KR_VALUES_NOT_ALLOWED', () => {
    expect(code(validateKrDefinition({ scoring: 'MANUAL', start: '0' }))).toBe(
      'KR_VALUES_NOT_ALLOWED',
    );
    expect(code(validateKrDefinition({ scoring: 'MANUAL', target: '1' }))).toBe(
      'KR_VALUES_NOT_ALLOWED',
    );
  });
});
