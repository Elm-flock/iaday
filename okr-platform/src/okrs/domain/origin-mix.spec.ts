import { originMix } from './origin-mix';

const mk = (td: number, bu: number) => [
  ...Array.from({ length: td }, () => ({ origin: 'TOP_DOWN' as const })),
  ...Array.from({ length: bu }, () => ({ origin: 'BOTTOM_UP' as const })),
];

describe('originMix', () => {
  it('3/10 bottom-up -> warning', () =>
    expect(originMix(mk(7, 3))).toEqual({
      topDown: 7,
      bottomUp: 3,
      bottomUpRatio: 0.3,
      warning: true,
    }));
  it('4/10 -> sin warning (borde inclusivo)', () =>
    expect(originMix(mk(6, 4)).warning).toBe(false));
  it('6/10 -> sin warning (borde inclusivo)', () =>
    expect(originMix(mk(4, 6)).warning).toBe(false));
  it('7/10 -> warning', () => expect(originMix(mk(3, 7)).warning).toBe(true));
  it('50/50 -> sin warning', () => expect(originMix(mk(5, 5)).warning).toBe(false));
  it('vacío -> ratio null y sin warning', () =>
    expect(originMix([])).toEqual({
      topDown: 0,
      bottomUp: 0,
      bottomUpRatio: null,
      warning: false,
    }));
});
