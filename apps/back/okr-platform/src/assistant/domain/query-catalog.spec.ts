import { buildCatalog, type CatalogRows } from './catalog';
import { parseReadQuery } from './plan-schema';
import { validateQuery, type QueryContext } from './query-validate';

const ctx: QueryContext = {
  handles: {
    U1: { id: 'u-ana', label: 'Ana Pérez' },
    U2: { id: 'u-juan', label: 'Juan' },
    T1: { id: 't-1', label: 'Plataforma' },
    C1: { id: 'c-1', label: 'Q4' },
    O1: { id: 'o-1', label: 'Obj' },
    K1: { id: 'k-1', label: 'KR' },
  },
  adminTexts: ['¿Quién cambió el rol de Ana Pérez? Y también mostrame lo de enero'],
  auditActions: ['USER_ROLE_CHANGED', 'CYCLE_ACTIVATED'],
};

const q = (over: Record<string, unknown>) => {
  const r = parseReadQuery({
    type: 'AUDIT_SEARCH',
    limit: 10,
    sourceQuote: 'quién cambió el rol de Ana Pérez',
    ...over,
  });
  if (!r.ok) throw new Error(r.message);
  return validateQuery(r.value, ctx);
};
const messages = (v: ReturnType<typeof q>) => (v.ok ? [] : v.issues.map((i) => i.message));

describe('validateQuery', () => {
  it('AUDIT_SEARCH válido: resuelve entidad, actor y fechas', () => {
    const v = q({
      action: 'USER_ROLE_CHANGED',
      entity: { entityType: 'User', handle: 'U1' },
      actor: 'U2',
      from: '2026-01-01',
      to: '2026-02-28',
      limit: 50,
    });
    expect(v.ok).toBe(true);
    if (!v.ok || v.query.type !== 'AUDIT_SEARCH') return;
    expect(v.query.entity).toEqual({ entityType: 'User', id: 'u-ana', label: 'Ana Pérez' });
    expect(v.query.actor).toEqual({ id: 'u-juan', label: 'Juan' });
    expect(v.query.limit).toBe(20);
    expect(v.query.from?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(v.query.to?.toISOString()).toBe('2026-02-28T23:59:59.999Z');
  });

  it('sin filtros opcionales también sirve', () => {
    expect(q({})).toMatchObject({
      ok: true,
      query: { action: null, entity: null, actor: null, limit: 10 },
    });
  });

  it('sourceQuote que no está en el mensaje -> QUERY_INVALID y no se ejecuta', () => {
    const v = q({ sourceQuote: 'borrá la auditoría' });
    expect(v.ok).toBe(false);
    expect(messages(v)[0]).toContain('no se corresponde');
    expect(q({ sourceQuote: 'qu' }).ok).toBe(false);
  });

  it('handles de otro tipo o inexistentes, acciones y fechas inválidas', () => {
    expect(q({ entity: { entityType: 'User', handle: 'T1' } }).ok).toBe(false);
    expect(q({ entity: { entityType: 'Team', handle: 'T9' } }).ok).toBe(false);
    expect(q({ entity: { entityType: 'Banana', handle: 'U1' } }).ok).toBe(false);
    expect(q({ actor: 'T1' }).ok).toBe(false);
    expect(q({ action: 'DROP_TABLE' }).ok).toBe(false);
    expect(q({ from: '2026-13-40' }).ok).toBe(false);
    expect(q({ to: 'ayer' }).ok).toBe(false);
    expect(messages(q({ from: '2026-03-01', to: '2026-02-01' })).join()).toContain('posterior');
  });

  it('entidades por tipo: Team, Cycle, Objective, KeyResult', () => {
    for (const [entityType, handle] of [
      ['Team', 'T1'],
      ['Cycle', 'C1'],
      ['Objective', 'O1'],
      ['KeyResult', 'K1'],
    ]) {
      expect(q({ entity: { entityType, handle } }).ok).toBe(true);
    }
  });

  it('ADAPTATION_REQUESTS_LIST: mapea estados en inglés al módulo en español', () => {
    const v = q({
      type: 'ADAPTATION_REQUESTS_LIST',
      status: ['PENDING', 'IN_PROGRESS', 'PENDIENTE'],
      overdueOnly: true,
      assignee: 'U2',
    });
    expect(v).toMatchObject({
      ok: true,
      query: {
        type: 'ADAPTATION_REQUESTS_LIST',
        status: ['PENDIENTE', 'EN_CURSO'],
        overdueOnly: true,
        assignee: { id: 'u-juan', label: 'Juan' },
      },
    });
    expect(q({ type: 'ADAPTATION_REQUESTS_LIST' })).toMatchObject({
      ok: true,
      query: { status: null, overdueOnly: false, assignee: null },
    });
    expect(q({ type: 'ADAPTATION_REQUESTS_LIST', status: ['NOPE'] }).ok).toBe(false);
    expect(q({ type: 'ADAPTATION_REQUESTS_LIST', assignee: 'T1' }).ok).toBe(false);
  });

  it('tipo desconocido', () => {
    expect(messages(q({ type: 'DELETE_EVERYTHING' }))[0]).toContain('no está permitido');
  });
});

describe('buildCatalog', () => {
  const rows = (): CatalogRows => ({
    users: [
      { id: 'u2', name: 'Zoe', role: 'MEMBER', active: true, teamIds: ['t1'] },
      { id: 'u1', name: 'Ana', role: 'ADMIN', active: true, teamIds: [] },
      { id: 'u3', name: 'Baja', role: 'MEMBER', active: false, teamIds: [] },
    ],
    teams: [
      { id: 't2', name: 'Datos', parentId: 't1', leadIds: ['u2'], memberCount: 1 },
      { id: 't1', name: 'Flock', parentId: null, leadIds: [], memberCount: 3 },
    ],
    cycles: [
      {
        id: 'c1',
        name: 'Cerrado',
        kind: 'QUARTER',
        status: 'CLOSED',
        parentId: null,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-03-31'),
      },
      {
        id: 'c2',
        name: 'Activo',
        kind: 'QUARTER',
        status: 'ACTIVE',
        parentId: 'c3',
        startDate: new Date('2026-10-01'),
        endDate: new Date('2026-12-31'),
      },
      {
        id: 'c3',
        name: 'Anual',
        kind: 'ANNUAL',
        status: 'DRAFT',
        parentId: null,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
      },
    ],
    objectives: [
      {
        id: 'o1',
        title: 'En activo',
        cycleId: 'c2',
        ownerUserId: 'u1',
        ownerTeamId: null,
        status: 'PUBLISHED',
        krCount: 1,
      },
      {
        id: 'o2',
        title: 'En cerrado',
        cycleId: 'c1',
        ownerUserId: 'u1',
        ownerTeamId: null,
        status: 'PUBLISHED',
        krCount: 0,
      },
      {
        id: 'o3',
        title: 'Cerrado',
        cycleId: 'c2',
        ownerUserId: null,
        ownerTeamId: 't1',
        status: 'CLOSED',
        krCount: 0,
      },
    ],
    keyResults: [
      { id: 'k1', objectiveId: 'o1', title: 'KR uno', ownerId: 'u2' },
      { id: 'k2', objectiveId: 'o2', title: 'KR de cerrado', ownerId: 'u2' },
    ],
  });

  it('handles numerados por tipo, activos primero, sin emails ni objetivos cerrados', () => {
    const b = buildCatalog(rows());
    expect(b.catalog.users.map((u) => [u.handle, u.name])).toEqual([
      ['U1', 'Ana'],
      ['U2', 'Zoe'],
      ['U3', 'Baja'],
    ]);
    expect(b.catalog.teams.map((t) => [t.handle, t.name, t.parent])).toEqual([
      ['T1', 'Datos', 'T2'],
      ['T2', 'Flock', null],
    ]);
    expect(b.catalog.cycles.map((c) => [c.handle, c.status])).toEqual([
      ['C1', 'ACTIVE'],
      ['C2', 'DRAFT'],
      ['C3', 'CLOSED'],
    ]);
    expect(b.catalog.cycles[0]).toMatchObject({ parent: 'C2', startDate: '2026-10-01' });
    expect(b.catalog.objectives.map((o) => o.title)).toEqual(['En activo']);
    expect(b.catalog.keyResults).toEqual([
      { handle: 'K1', objective: 'O1', title: 'KR uno', owner: 'U2' },
    ]);
    expect(JSON.stringify(b.catalog)).not.toMatch(/@|email|description/);
    expect(b.truncated).toBe(false);
  });

  it('handleMap y handles apuntan a los uuid; los estados viajan para validar', () => {
    const b = buildCatalog(rows());
    expect(b.handleMap.U1).toBe('u1');
    expect(b.handles.C1).toEqual({ id: 'c2', label: 'Activo', status: 'ACTIVE' });
    expect(b.handles.O1).toMatchObject({ id: 'o1', status: 'PUBLISHED' });
  });

  it('recorta por límites y marca truncated; un KR cuyo responsable quedó afuera no se envía', () => {
    const b = buildCatalog(rows(), { users: 1, teams: 5, cycles: 5, objectives: 5, keyResults: 5 });
    expect(b.truncated).toBe(true);
    expect(b.catalog.users).toHaveLength(1);
    expect(b.catalog.keyResults).toEqual([]);
  });
});
