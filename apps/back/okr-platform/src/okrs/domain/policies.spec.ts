import {
  Actor,
  canCheckIn,
  canCreateObjectiveFor,
  canEditKrTargetAfterPublish,
  canEditObjective,
  canViewObjective,
} from './policies';

type Status = 'DRAFT' | 'PUBLISHED' | 'CLOSED';
const actor = (id: string, role: Actor['role'], teams: Actor['teams'] = []): Actor => ({
  id,
  role,
  teams,
});
const admin = actor('adm', 'ADMIN');
const leaderT1 = actor('lead', 'LEADER', [{ teamId: 't1', isLead: true }]);
const memberT1 = actor('mem', 'MEMBER', [{ teamId: 't1', isLead: false }]);
const stranger = actor('x', 'MEMBER');

const userObj = (status: Status = 'PUBLISHED') => ({
  ownerUserId: 'mem',
  ownerTeamId: null,
  status,
});
const teamObj = (status: Status = 'PUBLISHED') => ({
  ownerUserId: null,
  ownerTeamId: 't1',
  status,
});

describe('canCreateObjectiveFor', () => {
  it('MEMBER solo para sí mismo', () => {
    expect(canCreateObjectiveFor(memberT1, { userId: 'mem' })).toBe(true);
    expect(canCreateObjectiveFor(memberT1, { userId: 'otro' })).toBe(false);
    expect(canCreateObjectiveFor(memberT1, { teamId: 't1' })).toBe(false);
  });
  it('LEADER: sí mismo o equipo que lidera', () => {
    expect(canCreateObjectiveFor(leaderT1, { userId: 'lead' })).toBe(true);
    expect(canCreateObjectiveFor(leaderT1, { teamId: 't1' })).toBe(true);
    expect(canCreateObjectiveFor(leaderT1, { teamId: 't2' })).toBe(false);
    expect(canCreateObjectiveFor(leaderT1, { userId: 'otro' })).toBe(false);
  });
  it('ADMIN todo', () => expect(canCreateObjectiveFor(admin, { teamId: 't9' })).toBe(true));
  it('sin owner -> false', () => expect(canCreateObjectiveFor(admin, {})).toBe(false));
});

describe('canEditObjective', () => {
  it('owner usuario', () => expect(canEditObjective(memberT1, userObj())).toBe(true));
  it('ajeno no', () => expect(canEditObjective(stranger, userObj())).toBe(false));
  it('lead del equipo owner', () => expect(canEditObjective(leaderT1, teamObj())).toBe(true));
  it('miembro no-lead del equipo owner no edita', () =>
    expect(canEditObjective(memberT1, teamObj())).toBe(false));
  it('ADMIN', () => expect(canEditObjective(admin, teamObj())).toBe(true));
});

describe('canViewObjective', () => {
  it('PUBLISHED y CLOSED: todos', () => {
    expect(canViewObjective(stranger, userObj('PUBLISHED'))).toBe(true);
    expect(canViewObjective(stranger, userObj('CLOSED'))).toBe(true);
  });
  it('DRAFT: solo editores', () => {
    expect(canViewObjective(stranger, userObj('DRAFT'))).toBe(false);
    expect(canViewObjective(memberT1, userObj('DRAFT'))).toBe(true);
    expect(canViewObjective(admin, userObj('DRAFT'))).toBe(true);
  });
});

describe('canEditKrTargetAfterPublish', () => {
  it('ADMIN', () => expect(canEditKrTargetAfterPublish(admin, teamObj())).toBe(true));
  it('lead del equipo owner', () =>
    expect(canEditKrTargetAfterPublish(leaderT1, teamObj())).toBe(true));
  it('lead de un equipo del owner usuario', () =>
    expect(canEditKrTargetAfterPublish(leaderT1, userObj(), ['t1'])).toBe(true));
  it('lead de otro equipo no', () =>
    expect(canEditKrTargetAfterPublish(leaderT1, userObj(), ['t2'])).toBe(false));
  it('owner usuario sin liderazgo no', () =>
    expect(canEditKrTargetAfterPublish(memberT1, userObj(), ['t1'])).toBe(false));
});

describe('canCheckIn', () => {
  it('owner del KR', () => expect(canCheckIn(stranger, { ownerId: 'x' }, userObj())).toBe(true));
  it('owner usuario del objetivo', () =>
    expect(canCheckIn(memberT1, { ownerId: 'z' }, userObj())).toBe(true));
  it('miembro del equipo owner', () =>
    expect(canCheckIn(memberT1, { ownerId: 'z' }, teamObj())).toBe(true));
  it('líder del equipo owner', () =>
    expect(canCheckIn(leaderT1, { ownerId: 'z' }, teamObj())).toBe(true));
  it('ajeno no', () => expect(canCheckIn(stranger, { ownerId: 'z' }, teamObj())).toBe(false));
  it('ADMIN ajeno no tiene bypass', () =>
    expect(canCheckIn(admin, { ownerId: 'z' }, teamObj())).toBe(false));
});
