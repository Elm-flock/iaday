import { describe, expect, it } from 'vitest';
import { failureMessage, GENERIC_ERRORS } from '@/lib/api/error-copy';
import { KR_ERROR_COPY, OBJECTIVE_ERROR_COPY } from './messages';
import {
  parseCreateKr,
  parseCreateObjective,
  parseDecimal,
  parseUpdateKr,
  parseUpdateObjective,
} from './objective-form-data';
import {
  canChangeKrTarget,
  canEditObjective,
  countsByOwner,
  limitStatus,
  ownerChoices,
  type Viewer,
} from './policy';

const fd = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

// Todos los códigos de `okrs.errors.ts` del back (400 / 409 / 422).
const BACK_CODES: [string, number][] = [
  ['ALIGNMENT_SELF_PARENT', 400],
  ['ALIGNMENT_CYCLE', 400],
  ['INVALID_MANUAL_SCORE', 400],
  ['INVALID_KR_RANGE', 400],
  ['KR_VALUES_REQUIRED', 400],
  ['KR_VALUES_NOT_ALLOWED', 400],
  ['OBJECTIVE_CLOSED', 409],
  ['OBJECTIVE_FIELD_LOCKED', 409],
  ['OBJECTIVE_NOT_DRAFT', 409],
  ['CYCLE_CLOSED', 409],
  ['OBJECTIVE_LIMIT_EXCEEDED', 422],
  ['KR_LIMIT_EXCEEDED', 422],
  ['MIN_OBJECTIVES_NOT_MET', 422],
  ['MIN_KRS_NOT_MET', 422],
  ['ALIGNMENT_PARENT_NOT_PUBLISHED', 422],
];

describe('copy de errores de OKRs', () => {
  const generic = Object.values(GENERIC_ERRORS);

  it.each(BACK_CODES)('%s tiene un mensaje propio en español (no el genérico)', (code, status) => {
    for (const copy of [OBJECTIVE_ERROR_COPY, KR_ERROR_COPY]) {
      const message = failureMessage({ status, body: { code, message: 'x' } }, copy);
      expect(generic).not.toContain(message);
      expect(message.length).toBeGreaterThan(40);
    }
  });

  it('explica el límite de 5, el mínimo de KRs y el mínimo de objetivos con cifras', () => {
    const msg = (code: string) =>
      failureMessage({ status: 422, body: { code } }, OBJECTIVE_ERROR_COPY);
    expect(msg('OBJECTIVE_LIMIT_EXCEEDED')).toMatch(/5 objetivos/);
    expect(msg('MIN_KRS_NOT_MET')).toMatch(/al menos 3 resultados clave/);
    expect(msg('MIN_OBJECTIVES_NOT_MET')).toMatch(/al menos 3 objetivos/);
  });

  it('un 403 sobre KRs explica que la meta tras publicar es del líder o administración', () => {
    expect(failureMessage({ status: 403 }, KR_ERROR_COPY)).toMatch(/líder o administración/);
  });
});

describe('parseDecimal', () => {
  it.each([
    ['12,5', '12.5'],
    ['1.234,5', '1234.5'],
    ['0.7', '0.7'],
    ['100', '100'],
    ['-3', '-3'],
  ])('%s -> %s', (raw, expected) => expect(parseDecimal(raw)).toBe(expected));

  it.each(['', 'abc', '1,2,3'])('rechaza %j', (raw) => expect(parseDecimal(raw)).toBeNull());
});

describe('parseCreateObjective', () => {
  const valid = {
    cycleId: 'c1',
    owner: 'user:u1',
    title: 'Mejorar la entrega',
    type: 'COMMITTED',
    origin: 'BOTTOM_UP',
  };

  it('arma el body con owner usuario o equipo y omite lo vacío', () => {
    const user = parseCreateObjective(fd(valid));
    expect(user).toEqual({
      ok: true,
      body: {
        cycleId: 'c1',
        title: 'Mejorar la entrega',
        type: 'COMMITTED',
        origin: 'BOTTOM_UP',
        ownerUserId: 'u1',
      },
    });
    const team = parseCreateObjective(fd({ ...valid, owner: 'team:t1', parentObjectiveId: 'p1' }));
    expect(team.ok && team.body).toMatchObject({ ownerTeamId: 't1', parentObjectiveId: 'p1' });
  });

  it('exige origen, tipo, responsable y un título de al menos 3 caracteres', () => {
    const result = parseCreateObjective(fd({ cycleId: '', title: 'ab' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.fieldErrors).sort()).toEqual(
        ['cycleId', 'origin', 'owner', 'title', 'type'].sort(),
      );
      expect(result.fieldErrors.origin).toMatch(/top-down/);
    }
  });
});

describe('parseUpdateObjective', () => {
  it('publicado: no envía tipo ni origen y permite desalinear', () => {
    const result = parseUpdateObjective(fd({ title: 'Nuevo título', description: '' }), false);
    expect(result).toEqual({
      ok: true,
      body: { title: 'Nuevo título', description: '', parentObjectiveId: null },
    });
  });
});

describe('parseCreateKr / parseUpdateKr', () => {
  it('numérico requiere inicio y meta distintos', () => {
    const base = { title: 'Clientes', scoring: 'DERIVED', ownerId: 'u1' };
    const missing = parseCreateKr(fd(base));
    expect(missing.ok).toBe(false);
    const same = parseCreateKr(fd({ ...base, startValue: '5', targetValue: '5' }));
    expect(!same.ok && same.fieldErrors.targetValue).toMatch(/distinta del inicio/);
    const ok = parseCreateKr(fd({ ...base, startValue: '0', targetValue: '1.000,5', unit: 'u' }));
    expect(ok.ok && ok.body).toMatchObject({ startValue: '0', targetValue: '1000.5', unit: 'u' });
  });

  it('manual no envía valores', () => {
    const result = parseCreateKr(
      fd({ title: 'Lanzar', scoring: 'MANUAL', ownerId: 'u1', startValue: '1', targetValue: '2' }),
    );
    expect(result.ok && 'startValue' in result.body).toBe(false);
  });

  it('con la meta bloqueada no envía inicio ni meta al editar', () => {
    const locked = parseUpdateKr(fd({ title: 'X', startValue: '1', targetValue: '9' }), {
      scoring: 'DERIVED',
      targetEditable: false,
    });
    expect(locked.ok && 'targetValue' in locked.body).toBe(false);
    const open = parseUpdateKr(fd({ title: 'X', startValue: '1', targetValue: '9' }), {
      scoring: 'DERIVED',
      targetEditable: true,
    });
    expect(open.ok && open.body).toMatchObject({ startValue: '1', targetValue: '9' });
  });
});

const member: Viewer = {
  id: 'm1',
  role: 'MEMBER',
  teams: [{ teamId: 't1', isLead: false, name: 'A' }],
};
const leader: Viewer = {
  id: 'l1',
  role: 'LEADER',
  teams: [{ teamId: 't1', isLead: true, name: 'A' }],
};
const admin: Viewer = { id: 'a1', role: 'ADMIN', teams: [] };
const directory = {
  users: [
    { id: 'm1', name: 'Mica', active: true },
    { id: 'l1', name: 'Lea', active: true },
    { id: 'x', name: 'Baja', active: false },
  ],
  teams: [
    { id: 't1', name: 'A' },
    { id: 't2', name: 'B' },
  ],
};

describe('políticas reflejadas en el front', () => {
  it('canEditObjective: responsable, líder del equipo owner y ADMIN', () => {
    expect(canEditObjective(member, { ownerUserId: 'm1', ownerTeamId: null })).toBe(true);
    expect(canEditObjective(member, { ownerUserId: 'otro', ownerTeamId: null })).toBe(false);
    expect(canEditObjective(leader, { ownerUserId: null, ownerTeamId: 't1' })).toBe(true);
    expect(canEditObjective(leader, { ownerUserId: null, ownerTeamId: 't2' })).toBe(false);
    expect(canEditObjective(admin, { ownerUserId: 'z', ownerTeamId: null })).toBe(true);
  });

  it('canChangeKrTarget: un MEMBER nunca; ADMIN y líderes sí', () => {
    expect(canChangeKrTarget(member, { ownerUserId: 'm1', ownerTeamId: null })).toBe(false);
    expect(canChangeKrTarget(leader, { ownerUserId: 'm1', ownerTeamId: null })).toBe(true);
    expect(canChangeKrTarget(leader, { ownerUserId: 'l1', ownerTeamId: null })).toBe(false);
    expect(canChangeKrTarget(admin, { ownerUserId: 'm1', ownerTeamId: null })).toBe(true);
  });

  it('ownerChoices acota y explica por rol; el líder no crea individuales de integrantes', () => {
    const m = ownerChoices(member, directory);
    expect(m.users.map((o) => o.value)).toEqual(['user:m1']);
    expect(m.teams).toEqual([]);
    expect(m.explanation).toMatch(/Solo podés crear objetivos propios/);

    const l = ownerChoices(leader, directory);
    expect(l.users.map((o) => o.value)).toEqual(['user:l1']);
    expect(l.teams.map((o) => o.value)).toEqual(['team:t1']);
    expect(l.explanation).toMatch(/los crea cada persona/);

    const a = ownerChoices(admin, directory);
    expect(a.users.map((o) => o.value)).toEqual(['user:m1', 'user:l1']); // sin inactivos
    expect(a.teams).toHaveLength(2);
  });

  it('limitStatus y countsByOwner cuentan borrador + publicado, no cerrados', () => {
    expect(limitStatus(4)).toEqual({ count: 4, max: 5, reached: false });
    expect(limitStatus(5).reached).toBe(true);
    const o = (status: 'DRAFT' | 'PUBLISHED' | 'CLOSED') =>
      ({ ownerUserId: 'm1', ownerTeamId: null, status }) as never;
    expect(countsByOwner([o('DRAFT'), o('PUBLISHED'), o('CLOSED')]).get('user:m1')).toBe(2);
  });
});
