import { isAchieved } from './closure';

const t = { committed: 1.0, aspirational: 0.7 };

describe('isAchieved', () => {
  it('COMMITTED 0.9 con umbral 1.0 -> no logrado', () =>
    expect(isAchieved('COMMITTED', 0.9, t)).toBe(false));
  it('COMMITTED 1.0 -> logrado', () => expect(isAchieved('COMMITTED', 1, t)).toBe(true));
  it('ASPIRATIONAL 0.7 con umbral 0.7 -> logrado (inclusivo)', () =>
    expect(isAchieved('ASPIRATIONAL', 0.7, t)).toBe(true));
  it('ASPIRATIONAL 0.6999 -> no logrado', () =>
    expect(isAchieved('ASPIRATIONAL', 0.6999, t)).toBe(false));
  it('usa el umbral custom del ciclo', () =>
    expect(isAchieved('COMMITTED', 0.9, { committed: 0.9, aspirational: 0.5 })).toBe(true));
});
