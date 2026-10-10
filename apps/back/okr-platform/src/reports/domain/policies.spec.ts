import type { Actor } from '../../okrs/domain/policies';
import { canViewTeamReport } from './policies';

const actor = (role: Actor['role'], teams: Actor['teams'] = []): Actor => ({
  id: 'u',
  role,
  teams,
});

describe('canViewTeamReport', () => {
  it('ADMIN siempre', () => {
    expect(canViewTeamReport(actor('ADMIN'), 't1')).toBe(true);
  });
  it('líder del equipo', () => {
    expect(canViewTeamReport(actor('LEADER', [{ teamId: 't1', isLead: true }]), 't1')).toBe(true);
  });
  it('el liderazgo lo da isLead, no el rol global', () => {
    expect(canViewTeamReport(actor('MEMBER', [{ teamId: 't1', isLead: true }]), 't1')).toBe(true);
    expect(canViewTeamReport(actor('LEADER', [{ teamId: 't1', isLead: false }]), 't1')).toBe(false);
  });
  it('miembro no líder del equipo: no', () => {
    expect(canViewTeamReport(actor('MEMBER', [{ teamId: 't1', isLead: false }]), 't1')).toBe(false);
  });
  it('líder de otro equipo: no', () => {
    expect(canViewTeamReport(actor('LEADER', [{ teamId: 't2', isLead: true }]), 't1')).toBe(false);
  });
  it('sin membresías: no', () => {
    expect(canViewTeamReport(actor('MEMBER'), 't1')).toBe(false);
  });
});
