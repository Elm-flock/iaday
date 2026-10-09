import { describe, expect, it } from 'vitest';
import { bandFromApi, derivedScore, isManualStep, previewCheckIn } from './check-in-preview';

describe('derivedScore', () => {
  it('calcula el avance proporcional y redondea a 4 decimales', () => {
    expect(derivedScore(0, 100, 70)).toBe(0.7);
    expect(derivedScore(0, 3, 1)).toBe(0.3333);
  });
  it('recorta a 0 y 1', () => {
    expect(derivedScore(0, 100, 150)).toBe(1);
    expect(derivedScore(10, 100, 5)).toBe(0);
  });
  it('funciona con meta menor al inicio', () => {
    expect(derivedScore(100, 0, 30)).toBe(0.7);
    expect(derivedScore(100, 0, 120)).toBe(0);
    expect(derivedScore(100, 0, -5)).toBe(1);
  });
  it('es defensivo con inicio igual a meta', () => {
    expect(derivedScore(5, 5, 5)).toBe(1);
    expect(derivedScore(5, 5, 4)).toBe(0);
  });
});

describe('isManualStep', () => {
  it('acepta múltiplos de 0,1 entre 0 y 1', () => {
    expect([0, 0.1, 0.3, 0.7, 1].every(isManualStep)).toBe(true);
  });
  it('rechaza el resto', () => {
    expect([0.15, -0.1, 1.1, NaN].some(isManualStep)).toBe(false);
  });
});

describe('previewCheckIn', () => {
  it('devuelve score y banda para un KR numérico', () => {
    expect(previewCheckIn({ scoring: 'DERIVED', start: 0, target: 100, value: 45 })).toEqual({
      score: 0.45,
      band: 'attention',
    });
  });
  it('banda verde exactamente en 0,7 y roja bajo 0,4', () => {
    expect(previewCheckIn({ scoring: 'DERIVED', start: 0, target: 10, value: 7 })?.band).toBe(
      'on-track',
    );
    expect(previewCheckIn({ scoring: 'DERIVED', start: 0, target: 10, value: 3 })?.band).toBe(
      'at-risk',
    );
  });
  it('null sin valor', () => {
    expect(previewCheckIn({ scoring: 'DERIVED', start: 0, target: 10, value: null })).toBeNull();
    expect(previewCheckIn({ scoring: 'MANUAL', manualScore: null })).toBeNull();
  });
  it('MANUAL usa el score elegido', () => {
    expect(previewCheckIn({ scoring: 'MANUAL', manualScore: 0.8 })).toEqual({
      score: 0.8,
      band: 'on-track',
    });
  });
});

describe('bandFromApi', () => {
  it('mapea las bandas del back', () => {
    expect(bandFromApi('GREEN')).toBe('on-track');
    expect(bandFromApi('YELLOW')).toBe('attention');
    expect(bandFromApi('RED')).toBe('at-risk');
  });
});
