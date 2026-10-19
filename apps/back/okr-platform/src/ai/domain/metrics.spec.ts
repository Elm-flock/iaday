import {
  adaptationAdoption,
  costPerActiveUser,
  mean,
  percentile,
  ratio,
  resolveRange,
} from './metrics';

describe('percentile', () => {
  it('interpola como percentile_cont', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([10, 20, 30, 40, 50], 0.95)).toBeCloseTo(48);
    expect(percentile([5], 0.5)).toBe(5);
  });
  it('null sin datos y acota p', () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([1, 9], 2)).toBe(9);
    expect(percentile([1, 9], -1)).toBe(1);
  });
});

describe('ratio / mean / costPerActiveUser', () => {
  it('ratio null con denominador 0', () => {
    expect(ratio(1, 0)).toBeNull();
    expect(ratio(1, 3)).toBe(0.3333);
  });
  it('mean', () => {
    expect(mean([])).toBeNull();
    expect(mean([1, 2, 2])).toBe(1.67);
  });
  it('costo por usuario activo', () => {
    expect(costPerActiveUser(1, 0)).toBeNull();
    expect(costPerActiveUser(0.003, 3)).toBe(0.001);
  });
});

describe('adaptationAdoption', () => {
  it('cuenta ACCEPTED y VALIDATED como adoptadas', () => {
    expect(adaptationAdoption({ DRAFT: 2, ACCEPTED: 1, VALIDATED: 1, NEEDS_REVIEW: 0 })).toEqual({
      total: 4,
      accepted: 2,
      rate: 0.5,
    });
  });
  it('sin datos: tasa null', () => {
    expect(adaptationAdoption({})).toEqual({ total: 0, accepted: 0, rate: null });
  });
});

describe('resolveRange', () => {
  const now = new Date('2026-10-18T12:00:00Z');
  it('default: últimos 30 días', () => {
    const r = resolveRange(undefined, undefined, now);
    expect(r.to).toEqual(now);
    expect(r.from).toEqual(new Date('2026-09-18T12:00:00Z'));
  });
  it('normaliza from/to invertidos', () => {
    const a = new Date('2026-01-01');
    const b = new Date('2026-02-01');
    expect(resolveRange(b, a, now)).toEqual({ from: a, to: b });
  });
  it('respeta from/to dados', () => {
    const a = new Date('2026-01-01');
    expect(resolveRange(a, undefined, now)).toEqual({ from: a, to: now });
  });
});
