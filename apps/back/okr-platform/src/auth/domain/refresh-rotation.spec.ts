import { evaluateRefresh } from './refresh-rotation';

const now = new Date('2026-10-09T12:00:00Z');
const at = (ms: number) => new Date(now.getTime() + ms);
const base = {
  revokedAt: null,
  replacedAt: null,
  expiresAt: at(60_000),
  familyExpiresAt: at(120_000),
};

describe('evaluateRefresh', () => {
  it('token inexistente -> UNKNOWN', () => expect(evaluateRefresh(null, now)).toBe('UNKNOWN'));
  it('token vigente -> VALID', () => expect(evaluateRefresh(base, now)).toBe('VALID'));
  it('expiresAt vencido -> EXPIRED', () =>
    expect(evaluateRefresh({ ...base, expiresAt: at(-1) }, now)).toBe('EXPIRED'));
  it('techo de familia vencido -> EXPIRED', () =>
    expect(evaluateRefresh({ ...base, familyExpiresAt: at(-1) }, now)).toBe('EXPIRED'));
  it('reemplazado dentro de la gracia -> RACE', () =>
    expect(evaluateRefresh({ ...base, replacedAt: at(-5_000) }, now)).toBe('RACE'));
  it('reemplazado exactamente en el límite de gracia -> RACE', () =>
    expect(evaluateRefresh({ ...base, replacedAt: at(-10_000) }, now)).toBe('RACE'));
  it('reemplazado fuera de la gracia -> REUSED', () =>
    expect(evaluateRefresh({ ...base, replacedAt: at(-10_001) }, now)).toBe('REUSED'));
  it('gracia configurable', () =>
    expect(evaluateRefresh({ ...base, replacedAt: at(-2_000) }, now, 1_000)).toBe('REUSED'));
  it('revocado -> REUSED', () =>
    expect(evaluateRefresh({ ...base, revokedAt: at(-1) }, now)).toBe('REUSED'));
  it('reemplazado y expirado sigue siendo REUSED (seguridad primero)', () =>
    expect(evaluateRefresh({ ...base, replacedAt: at(-60_000), expiresAt: at(-1) }, now)).toBe(
      'REUSED',
    ));
});
