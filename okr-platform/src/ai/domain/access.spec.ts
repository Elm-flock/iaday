import type { Actor } from '../../okrs/domain/policies';
import { canAdapt, canDecide, canValidateAdaptation } from './access';

const actor = (id: string, role: Actor['role'], teams: Actor['teams'] = []): Actor => ({
  id,
  role,
  teams,
});
const admin = actor('adm', 'ADMIN');
const leader = actor('lead', 'LEADER', [{ teamId: 't1', isLead: true }]);
const member = actor('mem', 'MEMBER', [{ teamId: 't1', isLead: false }]);
const stranger = actor('x', 'MEMBER');
const teamObj = { ownerUserId: null, ownerTeamId: 't1', status: 'PUBLISHED' as const };
const userObj = { ownerUserId: 'mem', ownerTeamId: null, status: 'PUBLISHED' as const };
const draft = { ownerUserId: 'mem', ownerTeamId: null, status: 'DRAFT' as const };
const fb = { type: 'FEEDBACK' as const, fromUserId: 'a', toUserId: 'b' };

describe('canAdapt', () => {
  it('objetivo publicado: cualquiera; DRAFT ajeno: no', () => {
    expect(canAdapt(stranger, { type: 'OBJECTIVE', objective: teamObj }).ok).toBe(true);
    expect(canAdapt(stranger, { type: 'CHECK_IN', objective: draft }).ok).toBe(false);
    expect(canAdapt(member, { type: 'OBJECTIVE', objective: draft }).ok).toBe(true);
  });
  it('feedback: solo emisor y receptor, sin bypass para ADMIN ni LEADER', () => {
    expect(canAdapt(actor('a', 'MEMBER'), fb).ok).toBe(true);
    expect(canAdapt(actor('b', 'MEMBER'), fb).ok).toBe(true);
    expect(canAdapt(admin, fb)).toMatchObject({ ok: false, code: 'NOT_VISIBLE' });
    expect(canAdapt(leader, fb).ok).toBe(false);
  });
});

describe('canValidateAdaptation', () => {
  it('ADMIN y líder del equipo dueño validan', () => {
    expect(canValidateAdaptation(admin, 'OBJECTIVE', teamObj).ok).toBe(true);
    expect(canValidateAdaptation(leader, 'CHECK_IN', teamObj).ok).toBe(true);
  });
  it('líder de un equipo del usuario dueño valida', () => {
    expect(canValidateAdaptation(leader, 'OBJECTIVE', userObj, ['t1']).ok).toBe(true);
    expect(canValidateAdaptation(leader, 'OBJECTIVE', userObj, ['t9'])).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
  });
  it('miembro y dueño individual no se autovalidan', () => {
    expect(canValidateAdaptation(member, 'OBJECTIVE', teamObj)).toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(canValidateAdaptation(member, 'OBJECTIVE', userObj, ['t1']).ok).toBe(false);
  });
  it('el dueño individual que además lidera uno de sus equipos NO se autovalida (ADMIN sí puede)', () => {
    const ownLeaderObj = { ownerUserId: 'lead', ownerTeamId: null, status: 'PUBLISHED' as const };
    expect(canValidateAdaptation(leader, 'OBJECTIVE', ownLeaderObj, ['t1'])).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
    const adminOwn = { ownerUserId: 'adm', ownerTeamId: null, status: 'PUBLISHED' as const };
    expect(canValidateAdaptation(admin, 'OBJECTIVE', adminOwn).ok).toBe(true);
  });
  it('rol LEADER sin isLead no alcanza', () => {
    const fakeLeader = actor('l2', 'LEADER', [{ teamId: 't1', isLead: false }]);
    expect(canValidateAdaptation(fakeLeader, 'OBJECTIVE', teamObj).ok).toBe(false);
  });
  it('FEEDBACK nunca es validable, ni por ADMIN', () => {
    expect(canValidateAdaptation(admin, 'FEEDBACK', null)).toMatchObject({
      ok: false,
      code: 'AI_VALIDATION_NOT_ALLOWED',
    });
  });
  it('sin objetivo asociado -> FORBIDDEN', () => {
    expect(canValidateAdaptation(admin, 'OBJECTIVE', null)).toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('canDecide', () => {
  it('solo quien la pidió', () => {
    expect(canDecide('u1', 'u1')).toBe(true);
    expect(canDecide('u1', 'u2')).toBe(false);
    expect(canDecide('u1', null)).toBe(false);
  });
});
