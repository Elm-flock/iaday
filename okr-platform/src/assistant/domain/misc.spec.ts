import { validatePasswordChange, MIN_PASSWORD_LENGTH } from '../../auth/domain/password-policy';
import { buildCatalog, type CatalogRows } from './catalog';
import { entityUrl } from './entity-url';

describe('entityUrl', () => {
  it('rutas de la app por tipo de entidad', () => {
    expect(entityUrl('User', 'u1')).toBe('/admin/usuarios');
    expect(entityUrl('Team', 't1')).toBe('/equipos/t1');
    expect(entityUrl('Cycle', 'c1')).toBe('/ciclos/c1');
    expect(entityUrl('Objective', 'o1')).toBe('/objetivos/o1');
    expect(entityUrl('KeyResult', 'k1', { objectiveId: 'o1' })).toBe('/objetivos/o1');
    expect(entityUrl('KeyResult', 'k1')).toBeNull();
    expect(entityUrl('Banana', 'x')).toBeNull();
  });
});

describe('validatePasswordChange', () => {
  it('exige el mínimo del seed (12), que no sea solo espacios y que cambie', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(validatePasswordChange('actual-clave-1', 'corta')).toMatchObject({
      ok: false,
      code: 'PASSWORD_TOO_SHORT',
    });
    expect(validatePasswordChange('actual-clave-1', ' '.repeat(12))).toMatchObject({
      ok: false,
      code: 'PASSWORD_TOO_SHORT',
    });
    expect(validatePasswordChange('misma-clave-123', 'misma-clave-123')).toMatchObject({
      ok: false,
      code: 'PASSWORD_UNCHANGED',
    });
    expect(validatePasswordChange('actual-clave-1', 'una-clave-nueva-12').ok).toBe(true);
  });
});

describe('buildCatalog (orden y prioridades)', () => {
  const d = (s: string) => new Date(s);
  const rows = (): CatalogRows => ({
    users: [
      { id: 'u1', name: 'Bea', role: 'MEMBER', active: true, teamIds: [] },
      { id: 'u2', name: 'Ana', role: 'MEMBER', active: true, teamIds: ['t9'] },
    ],
    teams: [{ id: 't1', name: 'Solo', parentId: 'fuera', leadIds: ['fuera'], memberCount: 0 }],
    cycles: [
      {
        id: 'c1',
        name: 'B borrador',
        kind: 'QUARTER',
        status: 'DRAFT',
        parentId: null,
        startDate: d('2027-01-01'),
        endDate: d('2027-03-31'),
      },
      {
        id: 'c2',
        name: 'A borrador',
        kind: 'QUARTER',
        status: 'DRAFT',
        parentId: null,
        startDate: d('2027-04-01'),
        endDate: d('2027-06-30'),
      },
      {
        id: 'c3',
        name: 'Raro',
        kind: 'QUARTER',
        status: 'WEIRD',
        parentId: null,
        startDate: d('2026-01-01'),
        endDate: d('2026-03-31'),
      },
      {
        id: 'c4',
        name: 'Activo',
        kind: 'QUARTER',
        status: 'ACTIVE',
        parentId: null,
        startDate: d('2026-10-01'),
        endDate: d('2026-12-31'),
      },
    ],
    objectives: [
      {
        id: 'o1',
        title: 'Zeta',
        cycleId: 'c4',
        ownerUserId: 'u1',
        ownerTeamId: null,
        status: 'DRAFT',
        krCount: 0,
      },
      {
        id: 'o2',
        title: 'Alfa',
        cycleId: 'c4',
        ownerUserId: 'u1',
        ownerTeamId: null,
        status: 'PUBLISHED',
        krCount: 0,
      },
      {
        id: 'o3',
        title: 'En borrador',
        cycleId: 'c1',
        ownerUserId: null,
        ownerTeamId: 't1',
        status: 'DRAFT',
        krCount: 0,
      },
      {
        id: 'o4',
        title: 'En ciclo raro',
        cycleId: 'c3',
        ownerUserId: 'u1',
        ownerTeamId: null,
        status: 'DRAFT',
        krCount: 0,
      },
      {
        id: 'o5',
        title: 'Ciclo desconocido',
        cycleId: 'nope',
        ownerUserId: 'u1',
        ownerTeamId: null,
        status: 'DRAFT',
        krCount: 0,
      },
    ],
    keyResults: [
      { id: 'k1', objectiveId: 'o1', title: 'Beta', ownerId: 'u1' },
      { id: 'k2', objectiveId: 'o1', title: 'Alfa', ownerId: 'u2' },
    ],
  });

  it('ciclos ACTIVE primero y luego por nombre; usuarios por nombre; objetivos por ciclo y título', () => {
    const b = buildCatalog(rows());
    expect(b.catalog.cycles.map((c) => c.name)).toEqual([
      'Activo',
      'A borrador',
      'B borrador',
      'Raro',
    ]);
    expect(b.catalog.users.map((u) => u.name)).toEqual(['Ana', 'Bea']);
    expect(b.catalog.objectives.map((o) => o.title)).toEqual(['Alfa', 'Zeta', 'En borrador']);
    expect(b.catalog.keyResults.map((k) => k.title)).toEqual(['Alfa', 'Beta']);
  });

  it('referencias fuera del catálogo (padre, líder, equipo) se omiten sin romper', () => {
    const b = buildCatalog(rows());
    expect(b.catalog.teams[0]).toMatchObject({ parent: null, leads: [] });
    expect(b.catalog.users.find((u) => u.name === 'Ana')?.teams).toEqual([]);
  });
});
