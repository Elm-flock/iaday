import { validateTeamMove, type ParentMap } from './team-tree';

describe('validateTeamMove', () => {
  // org -> A -> B -> C ; org -> D
  const parentOf: ParentMap = new Map([
    ['org', null],
    ['A', 'org'],
    ['B', 'A'],
    ['C', 'B'],
    ['D', 'org'],
  ]);

  it('mover bajo un equipo de otra rama es válido', () => {
    expect(validateTeamMove('A', 'D', parentOf)).toEqual({ ok: true, value: undefined });
  });

  it('mover bajo el mismo padre actual es válido (no-op)', () => {
    expect(validateTeamMove('B', 'A', parentOf).ok).toBe(true);
  });

  it('un equipo no puede ser su propio padre', () => {
    expect(validateTeamMove('A', 'A', parentOf)).toMatchObject({
      ok: false,
      code: 'TEAM_SELF_PARENT',
    });
  });

  it('mover A bajo su hijo directo B crea un ciclo', () => {
    expect(validateTeamMove('A', 'B', parentOf)).toMatchObject({ ok: false, code: 'TEAM_CYCLE' });
  });

  it('mover A bajo un descendiente profundo C crea un ciclo', () => {
    expect(validateTeamMove('A', 'C', parentOf)).toMatchObject({ ok: false, code: 'TEAM_CYCLE' });
  });

  it('mover la raíz bajo cualquier descendiente crea un ciclo', () => {
    expect(validateTeamMove('org', 'C', parentOf)).toMatchObject({ ok: false, code: 'TEAM_CYCLE' });
  });

  it('padre desconocido en el mapa: no hay ciclo posible', () => {
    expect(validateTeamMove('A', 'X', parentOf).ok).toBe(true);
  });

  it('datos ya corruptos con un lazo ajeno no cuelgan la validación', () => {
    const corrupt: ParentMap = new Map([
      ['X', 'Y'],
      ['Y', 'X'],
    ]);
    expect(validateTeamMove('A', 'X', corrupt).ok).toBe(true);
  });
});
