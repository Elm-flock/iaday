import { assertManualStep, krScore, objectiveScore } from './score';
import { bandOf } from './bands';

describe('krScore', () => {
  const derived = (start: number, target: number, current: number) =>
    krScore({ scoring: 'DERIVED', start, target, current });

  it('calcula progreso lineal', () => expect(derived(0, 10, 5)).toBe(0.5));
  it('soporta target < start (métrica a la baja)', () => expect(derived(100, 60, 80)).toBe(0.5));
  it('clamp superior a 1', () => expect(derived(0, 10, 15)).toBe(1));
  it('clamp inferior a 0', () => expect(derived(0, 10, -3)).toBe(0));
  it('redondea a 4 decimales', () => expect(derived(0, 3, 1)).toBe(0.3333));
  it('start == target: logrado solo si current alcanza target', () => {
    expect(derived(5, 5, 5)).toBe(1);
    expect(derived(5, 5, 4)).toBe(0);
  });
  it('MANUAL devuelve el score manual', () =>
    expect(krScore({ scoring: 'MANUAL', manual: 0.3 })).toBe(0.3));
});

describe('assertManualStep', () => {
  it.each([0, 0.1, 0.3, 0.7, 1])('acepta %p', (v) => expect(assertManualStep(v).ok).toBe(true));
  it.each([0.35, -0.1, 1.1, NaN])('rechaza %p', (v) => {
    const r = assertManualStep(v);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_MANUAL_SCORE');
  });
});

describe('objectiveScore', () => {
  it('promedio simple redondeado a 4 decimales', () =>
    expect(objectiveScore([0.2, 0.8, 1.0])).toBe(0.6667));
  it('promedio exacto', () => expect(objectiveScore([0.2, 0.6, 1.0])).toBe(0.6));
  it('sin KRs -> 0', () => expect(objectiveScore([])).toBe(0));
});

describe('bandOf', () => {
  it.each([
    [0, 'RED'],
    [0.39, 'RED'],
    [0.399999, 'RED'],
    [0.4, 'YELLOW'],
    [0.69, 'YELLOW'],
    [0.7, 'GREEN'],
    [1, 'GREEN'],
  ])('%p -> %s', (score, band) => expect(bandOf(score)).toBe(band));
});
