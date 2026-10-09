import { describe, expect, it } from 'vitest';
import { cycleLabel } from './cycle-label';

describe('cycleLabel', () => {
  it('es corta: nombre y rango dd/mm–dd/mm', () => {
    expect(cycleLabel({ name: 'Q1 2026', startDate: '2026-01-01', endDate: '2026-03-31' })).toBe(
      'Q1 2026 · 01/01–31/03',
    );
  });
});
