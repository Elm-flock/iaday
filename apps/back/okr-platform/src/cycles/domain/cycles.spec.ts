import {
  canTransitionCycle,
  cycleNameTakenMessage,
  isCycleNameTaken,
  normalizeCycleName,
  validateCycleHierarchy,
  validateCycleNameAvailable,
  validateThresholds,
} from './cycles';
import type { Result } from '../../common/domain/result';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const code = (r: Result<unknown>) => (r.ok ? null : r.code);
const annual = {
  kind: 'ANNUAL' as const,
  start: d('2026-01-01'),
  end: d('2026-12-31'),
  status: 'ACTIVE' as const,
};
const quarter = (start: string, end: string) => ({
  kind: 'QUARTER' as const,
  start: d(start),
  end: d(end),
});

describe('validateCycleHierarchy', () => {
  it('ANNUAL sin padre -> ok', () =>
    expect(
      validateCycleHierarchy({ kind: 'ANNUAL', start: d('2026-01-01'), end: d('2026-12-31') }).ok,
    ).toBe(true));
  it('end <= start -> rechaza', () =>
    expect(
      code(
        validateCycleHierarchy({ kind: 'ANNUAL', start: d('2026-05-01'), end: d('2026-05-01') }),
      ),
    ).toBe('INVALID_DATE_RANGE'));
  it('ANNUAL con padre -> rechaza', () =>
    expect(
      code(
        validateCycleHierarchy(
          { kind: 'ANNUAL', start: d('2026-01-01'), end: d('2026-12-31') },
          annual,
        ),
      ),
    ).toBe('ANNUAL_CANNOT_HAVE_PARENT'));
  it('QUARTER sin padre -> rechaza', () =>
    expect(code(validateCycleHierarchy(quarter('2026-01-01', '2026-03-31')))).toBe(
      'QUARTER_REQUIRES_ANNUAL_PARENT',
    ));
  it('QUARTER con padre QUARTER -> rechaza', () =>
    expect(
      code(
        validateCycleHierarchy(quarter('2026-01-01', '2026-03-31'), {
          ...annual,
          kind: 'QUARTER',
        }),
      ),
    ).toBe('QUARTER_REQUIRES_ANNUAL_PARENT'));
  it('QUARTER dentro del ANNUAL -> ok', () =>
    expect(validateCycleHierarchy(quarter('2026-04-01', '2026-06-30'), annual).ok).toBe(true));
  it('QUARTER fuera de contención -> rechaza', () =>
    expect(code(validateCycleHierarchy(quarter('2026-10-01', '2027-01-15'), annual))).toBe(
      'QUARTER_OUT_OF_PARENT_RANGE',
    ));
  it('QUARTER que empieza antes del padre -> rechaza', () =>
    expect(code(validateCycleHierarchy(quarter('2025-12-01', '2026-02-01'), annual))).toBe(
      'QUARTER_OUT_OF_PARENT_RANGE',
    ));
  it('hermanos contiguos sin solape -> ok', () =>
    expect(
      validateCycleHierarchy(quarter('2026-04-01', '2026-06-30'), annual, [
        { start: d('2026-01-01'), end: d('2026-03-31') },
      ]).ok,
    ).toBe(true));
  it('hermano solapado -> rechaza', () =>
    expect(
      code(
        validateCycleHierarchy(quarter('2026-03-31', '2026-06-30'), annual, [
          { start: d('2026-01-01'), end: d('2026-03-31') },
        ]),
      ),
    ).toBe('QUARTER_OVERLAPS_SIBLING'));
});

describe('canTransitionCycle', () => {
  it.each([
    ['DRAFT', 'ACTIVE'],
    ['ACTIVE', 'CLOSED'],
  ] as const)('%s -> %s ok', (a, b) => expect(canTransitionCycle(a, b).ok).toBe(true));
  it.each([
    ['DRAFT', 'CLOSED'],
    ['ACTIVE', 'DRAFT'],
    ['CLOSED', 'ACTIVE'],
    ['ACTIVE', 'ACTIVE'],
  ] as const)('%s -> %s rechaza', (a, b) =>
    expect(code(canTransitionCycle(a, b))).toBe('INVALID_CYCLE_TRANSITION'),
  );
});

describe('validateThresholds', () => {
  it('defaults 1.0 / 0.7 -> ok', () =>
    expect(validateThresholds({ committed: 1, aspirational: 0.7 }).ok).toBe(true));
  it.each([0, 1.2, -0.1, NaN])('rechaza %p', (v) => {
    expect(code(validateThresholds({ committed: v, aspirational: 0.7 }))).toBe('INVALID_THRESHOLD');
    expect(code(validateThresholds({ committed: 1, aspirational: v }))).toBe('INVALID_THRESHOLD');
  });
});

describe('nombre único de ciclo', () => {
  it('normaliza espacios, mayúsculas y tildes', () => {
    expect(normalizeCycleName('  Año   2027 ')).toBe('ano 2027');
    expect(normalizeCycleName('Q1 2027')).toBe(normalizeCycleName('q1  2027'));
    expect(normalizeCycleName('ÁÉÍÓÚ')).toBe('aeiou');
  });
  it.each([
    ['2027', ' 2027 '],
    ['Q1 2027', 'q1 2027'],
    ['Año 2027', 'ANO 2027'],
    ['Q1	2027', 'Q1 2027'],
  ])('"%s" y "%s" son el mismo nombre', (a, b) => expect(isCycleNameTaken(a, [b])).toBe(true));
  it('nombres distintos no chocan (ni "Q1" con "Q1 2027")', () => {
    expect(isCycleNameTaken('Q1 2027', ['Q1', 'Q2 2027', '2027'])).toBe(false);
    expect(isCycleNameTaken('2027', [])).toBe(false);
  });
  it('validateCycleNameAvailable devuelve CYCLE_NAME_TAKEN con el mensaje en lenguaje claro', () => {
    const r = validateCycleNameAvailable('  q1 2027 ', ['Q1 2027']);
    expect(r).toEqual({
      ok: false,
      code: 'CYCLE_NAME_TAKEN',
      message: 'Ya existe un ciclo llamado «q1 2027». Elegí otro nombre o usá el existente.',
    });
    expect(cycleNameTakenMessage(' X ')).toContain('«X»');
    expect(validateCycleNameAvailable('Q2 2027', ['Q1 2027']).ok).toBe(true);
  });
});
