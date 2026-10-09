import { describe, expect, it } from 'vitest';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatScore,
  formatTime,
} from './format';

describe('format es-AR', () => {
  it('formatea números con punto de miles y coma decimal', () => {
    expect(formatNumber(1234.56)).toBe('1.234,56');
    expect(formatNumber(1234567.891)).toBe('1.234.567,89');
    expect(formatNumber(12)).toBe('12,00');
    expect(formatNumber(1234, 0)).toBe('1.234');
    expect(formatNumber(-1234.5)).toBe('-1.234,50');
    expect(formatNumber(-0.001)).toBe('0,00');
  });

  it('formatea importes', () => {
    expect(formatCurrency(1234.56)).toBe('$ 1.234,56');
  });

  it('formatea scores con dos decimales', () => {
    expect(formatScore(0.7)).toBe('0,70');
    expect(formatScore(1)).toBe('1,00');
    expect(formatScore(0.395)).toBe('0,40');
  });

  it('formatea porcentajes desde una proporción', () => {
    expect(formatPercent(0.7)).toBe('70 %');
    expect(formatPercent(1)).toBe('100 %');
    expect(formatPercent(0.125, 1)).toBe('12,5 %');
  });

  it('formatea fechas dd/mm/aaaa', () => {
    expect(formatDate('2026-10-09')).toBe('09/10/2026');
    expect(formatDate(new Date('2026-01-02T15:00:00Z'))).toBe('02/01/2026');
  });

  it('usa la hora de Buenos Aires y 24 h', () => {
    // 17:32 UTC = 14:32 ART (UTC-3)
    expect(formatTime(new Date('2026-10-09T17:32:00Z'))).toBe('14:32');
    expect(formatTime(new Date('2026-10-09T03:05:00Z'))).toBe('00:05');
    expect(formatDateTime(new Date('2026-10-09T17:32:00Z'))).toBe('09/10/2026 14:32');
  });

  it('rechaza fechas inválidas', () => {
    expect(() => formatDate('nope')).toThrow(RangeError);
  });
});
