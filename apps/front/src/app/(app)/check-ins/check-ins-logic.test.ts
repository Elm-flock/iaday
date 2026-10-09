import { describe, expect, it } from 'vitest';
import { parseCheckIn } from './check-in-form-data';
import { CHECK_IN_CODE_COPY, CHECK_IN_ERROR_COPY, CHECK_IN_FORBIDDEN_REASON } from './messages';
import { canCheckIn, checkInAvailability } from './policy';
import { failureMessage } from '@/lib/api/error-copy';

const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};

describe('parseCheckIn', () => {
  it('KR numérico: valor es-AR a decimal y nota opcional', () => {
    expect(
      parseCheckIn(form({ action: 'UPDATE', value: '1.234,5', note: ' avance ' }), 'DERIVED'),
    ).toEqual({ ok: true, body: { action: 'UPDATE', value: '1234.5', note: 'avance' } });
  });
  it('KR numérico: sin valor o con texto es error de campo', () => {
    for (const value of ['', 'abc']) {
      const r = parseCheckIn(form({ action: 'UPDATE', value }), 'DERIVED');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fieldErrors.value).toMatch(/número/);
    }
  });
  it('KR manual: puntaje en pasos de 0,1 (acepta coma)', () => {
    expect(parseCheckIn(form({ action: 'CONTINUE', manualScore: '0,7' }), 'MANUAL')).toEqual({
      ok: true,
      body: { action: 'CONTINUE', manualScore: 0.7 },
    });
    expect(parseCheckIn(form({ action: 'CONTINUE', manualScore: '0.55' }), 'MANUAL').ok).toBe(
      false,
    );
  });
  it('acción inválida y nota demasiado larga', () => {
    const r = parseCheckIn(form({ action: 'X', value: '1', note: 'a'.repeat(2001) }), 'DERIVED');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(['action', 'note']);
  });
});

describe('policy de check-in (espejo del back)', () => {
  const objective = { ownerUserId: 'u-owner', ownerTeamId: null, status: 'PUBLISHED' as const };
  const teamObjective = { ownerUserId: null, ownerTeamId: 't1', status: 'PUBLISHED' as const };
  const viewer = (over = {}) => ({ id: 'x', role: 'MEMBER' as const, teams: [], ...over });

  it('responsable del KR, del objetivo y miembros del equipo pueden', () => {
    expect(canCheckIn(viewer({ id: 'k' }), objective, { ownerId: 'k' })).toBe(true);
    expect(canCheckIn(viewer({ id: 'u-owner' }), objective, { ownerId: 'k' })).toBe(true);
    const member = viewer({ teams: [{ teamId: 't1', name: 'T', isLead: false }] });
    expect(canCheckIn(member, teamObjective, { ownerId: 'k' })).toBe(true);
  });
  it('ADMIN no tiene atajo y se explica por qué', () => {
    const admin = viewer({ role: 'ADMIN' });
    expect(canCheckIn(admin, objective, { ownerId: 'k' })).toBe(false);
    expect(checkInAvailability(admin, objective, { ownerId: 'k' })).toEqual({
      allowed: false,
      reason: CHECK_IN_FORBIDDEN_REASON,
    });
  });
  it('borrador y cerrado explican su razón', () => {
    const me = viewer({ id: 'u-owner' });
    const kr = { ownerId: 'k' };
    expect(checkInAvailability(me, { ...objective, status: 'DRAFT' }, kr)).toMatchObject({
      allowed: false,
      reason: expect.stringMatching(/Publicá/),
    });
    expect(checkInAvailability(me, { ...objective, status: 'CLOSED' }, kr)).toMatchObject({
      allowed: false,
      reason: expect.stringMatching(/cerrado/),
    });
    expect(checkInAvailability(me, objective, kr)).toEqual({ allowed: true });
  });
});

describe('copy de errores de check-in', () => {
  it('cada código del back tiene mensaje en español', () => {
    for (const code of [
      'OBJECTIVE_NOT_PUBLISHED',
      'OBJECTIVE_CLOSED',
      'CYCLE_CLOSED',
      'INVALID_MANUAL_SCORE',
    ]) {
      expect(CHECK_IN_CODE_COPY[code]).toBeTruthy();
    }
  });
  it('mapea 409 por código, 403 y 400', () => {
    expect(
      failureMessage({ status: 409, body: { code: 'OBJECTIVE_CLOSED' } }, CHECK_IN_ERROR_COPY),
    ).toMatch(/cerrado/);
    expect(failureMessage({ status: 403 }, CHECK_IN_ERROR_COPY)).toMatch(/No podés registrar/);
    expect(failureMessage({ status: 400 }, CHECK_IN_ERROR_COPY)).toMatch(/no son válidos/);
  });
});
