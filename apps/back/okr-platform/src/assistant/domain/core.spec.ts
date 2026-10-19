import { generateInitialPassword, INITIAL_PASSWORD_LENGTH } from './password';
import { buildActionCall } from './plan-to-dto';
import { canonicalJson, computePlanHash, hashesMatch } from './plan-hash';
import { parsePlan, parseReadQuery } from './plan-schema';
import {
  canTransitionPlan,
  computeExpiry,
  DEFAULT_PLAN_TTL_MIN,
  EXECUTING_STALE_MS,
  finalStatus,
  isExpired,
  isStale,
  PLAN_STATUSES,
} from './plan-state';
import {
  MESSAGE_RETENTION_DAYS,
  PLAN_RETENTION_DAYS,
  PURGE_MIN_INTERVAL_MS,
  retentionCutoffs,
  shouldPurge,
} from './retention';
import { isQuoteGrounded, normalizeText } from './text';
import type { ResolvedAction } from './plan-validate';

describe('text', () => {
  it('normalizeText: sin tildes, minúsculas y espacios colapsados', () => {
    expect(normalizeText('  Creá   el  EQUIPO Ñandú ')).toBe('crea el equipo nandu');
  });
  it('isQuoteGrounded: substring normalizado; vacío nunca ancla', () => {
    expect(isQuoteGrounded('crea el equipo', ['Por favor, CREÁ el equipo Datos'])).toBe(true);
    expect(isQuoteGrounded('borrá todo', ['Por favor, creá el equipo'])).toBe(false);
    expect(isQuoteGrounded('   ', ['algo'])).toBe(false);
    expect(isQuoteGrounded('algo', [])).toBe(false);
  });
});

describe('plan-hash', () => {
  it('canonicalJson ordena claves y descarta undefined', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: undefined, e: null }] })).toBe(
      '{"a":[{"d":2,"e":null}],"b":1}',
    );
    expect(canonicalJson(undefined)).toBe('null');
  });
  it('el hash depende de acciones, persona y vencimiento y no del orden de claves', () => {
    const expiresAt = new Date('2026-10-18T12:00:00Z');
    const base = computePlanHash({ actions: [{ a: 1, b: 2 }], requestedById: 'u1', expiresAt });
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(computePlanHash({ actions: [{ b: 2, a: 1 }], requestedById: 'u1', expiresAt })).toBe(
      base,
    );
    expect(computePlanHash({ actions: [{ a: 1, b: 3 }], requestedById: 'u1', expiresAt })).not.toBe(
      base,
    );
    expect(computePlanHash({ actions: [{ a: 1, b: 2 }], requestedById: 'u2', expiresAt })).not.toBe(
      base,
    );
    expect(
      computePlanHash({
        actions: [{ a: 1, b: 2 }],
        requestedById: 'u1',
        expiresAt: new Date(expiresAt.getTime() + 1),
      }),
    ).not.toBe(base);
  });
  it('hashesMatch compara en tiempo constante y tolera largos distintos', () => {
    expect(hashesMatch('abc', 'abc')).toBe(true);
    expect(hashesMatch('abc', 'abd')).toBe(false);
    expect(hashesMatch('abc', 'abcd')).toBe(false);
  });
});

describe('plan-state', () => {
  it('transiciones permitidas y prohibidas', () => {
    expect(canTransitionPlan('PROPOSED', 'EXECUTING').ok).toBe(true);
    expect(canTransitionPlan('PROPOSED', 'DISCARDED').ok).toBe(true);
    expect(canTransitionPlan('PROPOSED', 'EXPIRED').ok).toBe(true);
    expect(canTransitionPlan('EXECUTING', 'INTERRUPTED').ok).toBe(true);
    for (const terminal of [
      'INVALID',
      'EXECUTED',
      'PARTIAL',
      'FAILED',
      'INTERRUPTED',
      'DISCARDED',
      'EXPIRED',
    ] as const) {
      for (const to of PLAN_STATUSES) expect(canTransitionPlan(terminal, to).ok).toBe(false);
    }
    expect(canTransitionPlan('PROPOSED', 'EXECUTED')).toMatchObject({
      ok: false,
      code: 'ASSISTANT_PLAN_ALREADY_DECIDED',
    });
  });
  it('vencimiento a los 15 minutos (inclusive del instante exacto)', () => {
    const now = new Date('2026-10-18T10:00:00Z');
    const exp = computeExpiry(now);
    expect(exp.getTime() - now.getTime()).toBe(DEFAULT_PLAN_TTL_MIN * 60_000);
    expect(isExpired(exp, new Date(exp.getTime() - 1))).toBe(false);
    expect(isExpired(exp, exp)).toBe(true);
    expect(computeExpiry(now, 1).getTime() - now.getTime()).toBe(60_000);
  });
  it('EXECUTING queda interrumpido tras 5 minutos sin actividad', () => {
    const now = new Date('2026-10-18T10:10:00Z');
    expect(isStale(new Date(now.getTime() - EXECUTING_STALE_MS), now)).toBe(false);
    expect(isStale(new Date(now.getTime() - EXECUTING_STALE_MS - 1), now)).toBe(true);
    expect(isStale(new Date(now.getTime() - 1000), now, 500)).toBe(true);
  });
  it('estado final según los pasos', () => {
    expect(finalStatus([{ status: 'OK' }, { status: 'OK' }])).toBe('EXECUTED');
    expect(finalStatus([{ status: 'OK' }, { status: 'FAILED' }, { status: 'SKIPPED' }])).toBe(
      'PARTIAL',
    );
    expect(finalStatus([{ status: 'FAILED' }, { status: 'SKIPPED' }])).toBe('FAILED');
  });
});

describe('retention', () => {
  it('cortes de 30 y 90 días', () => {
    const now = new Date('2026-10-18T00:00:00Z');
    const { messagesBefore, plansBefore } = retentionCutoffs(now);
    expect(now.getTime() - messagesBefore.getTime()).toBe(MESSAGE_RETENTION_DAYS * 86_400_000);
    expect(now.getTime() - plansBefore.getTime()).toBe(PLAN_RETENTION_DAYS * 86_400_000);
    expect(MESSAGE_RETENTION_DAYS).toBe(30);
    expect(PLAN_RETENTION_DAYS).toBe(90);
  });
  it('la purga perezosa corre como mucho una vez por hora, salvo force', () => {
    const now = new Date('2026-10-18T10:00:00Z');
    expect(shouldPurge(null, now)).toBe(true);
    expect(shouldPurge(now.getTime() - PURGE_MIN_INTERVAL_MS + 1, now)).toBe(false);
    expect(shouldPurge(now.getTime() - PURGE_MIN_INTERVAL_MS, now)).toBe(true);
    expect(shouldPurge(now.getTime(), now, true)).toBe(true);
  });
});

describe('password', () => {
  it('20 caracteres base64url, distintas cada vez', () => {
    const a = generateInitialPassword();
    const b = generateInitialPassword();
    expect(a).toHaveLength(INITIAL_PASSWORD_LENGTH);
    expect(a).toMatch(/^[A-Za-z0-9_-]{20}$/);
    expect(a).not.toBe(b);
  });
  it('usa la fuente inyectada', () => {
    expect(generateInitialPassword(() => Buffer.alloc(15, 0))).toBe('A'.repeat(20));
  });
});

describe('parsePlan / parseReadQuery', () => {
  it('rechaza planes sin forma', () => {
    expect(parsePlan(null).ok).toBe(false);
    expect(parsePlan({ summary: '', actions: [{}] }).ok).toBe(false);
    expect(parsePlan({ summary: 'x', actions: [] }).ok).toBe(false);
    expect(parsePlan({ summary: 'x' }).ok).toBe(false);
  });
  it('descarta campos desconocidos (p. ej. password) y recorta summary/assumptions', () => {
    const r = parsePlan({
      summary: ' hola ',
      assumptions: ['a', 3, 'b', 'c', 'd', 'e', 'f'],
      actions: [
        {
          type: 'CREATE_USER',
          ref: 'u1',
          name: 'A',
          email: 'a@x.com',
          password: 'secreta',
          sourceQuote: 'dá de alta',
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.summary).toBe('hola');
    expect(r.value.assumptions).toHaveLength(5);
    expect(JSON.stringify(r.value)).not.toContain('secreta');
    expect(r.value.actions[0].scalars).toEqual({ name: 'A', email: 'a@x.com' });
  });
  it('referencias con formato inválido se marcan', () => {
    const r = parsePlan({
      summary: 's',
      actions: [
        { type: 'ACTIVATE_CYCLE', cycle: { kind: 'X' }, sourceQuote: 'abc' },
        { type: 'CREATE_USER', ref: 1, name: 'x', email: 'e', sourceQuote: 1 },
      ],
    });
    if (!r.ok) throw new Error('debería parsear');
    expect(r.value.actions[0].shapeProblems.join()).toContain('formato');
    expect(r.value.actions[1].ref).toBeNull();
    expect(r.value.actions[1].sourceQuote).toBe('');
  });
  it('parseReadQuery: forma mínima y filtros opcionales', () => {
    expect(parseReadQuery(null).ok).toBe(false);
    expect(parseReadQuery({}).ok).toBe(false);
    const r = parseReadQuery({
      type: 'AUDIT_SEARCH',
      action: 'USER_ROLE_CHANGED',
      entity: { entityType: 'User', handle: 'U1' },
      actor: 'U2',
      from: '2026-01-01',
      to: '2026-02-01',
      limit: 5,
      sourceQuote: 'q',
      status: ['PENDING', 3],
      overdueOnly: true,
      assignee: 'U3',
    });
    expect(r.ok && r.value).toMatchObject({
      limit: 5,
      overdueOnly: true,
      status: ['PENDING'],
      actor: 'U2',
    });
    const d = parseReadQuery({ type: 'AUDIT_SEARCH', entity: { entityType: 1 } });
    expect(d.ok && d.value).toMatchObject({
      limit: 10,
      entity: null,
      status: null,
      overdueOnly: null,
    });
  });
});

describe('plan-to-dto', () => {
  const act = (
    type: string,
    params: Record<string, unknown>,
    refs: ResolvedAction['refs'] = {},
  ): ResolvedAction => ({
    index: 0,
    type,
    ref: null,
    sourceQuote: 'x',
    params,
    refs,
    description: '',
  });
  const existing = (id: string) => ({ kind: 'EXISTING' as const, id, label: id });
  const created = (ref: string) => ({ kind: 'NEW' as const, ref, label: ref });
  const resolve = (r: { kind: string; id?: string; ref?: string }) =>
    r.kind === 'EXISTING' ? (r.id ?? null) : r.ref === 'ok' ? 'new-uuid' : null;

  it('CREATE_USER no lleva contraseña', () => {
    const r = buildActionCall(
      act('CREATE_USER', { name: 'A', email: 'a@x.com', role: 'MEMBER', password: 'zzz' }),
      resolve,
    );
    expect(r).toMatchObject({
      ok: true,
      value: { dtoName: 'CreateUserDto', dto: { name: 'A', email: 'a@x.com', role: 'MEMBER' } },
    });
    expect(JSON.stringify(r)).not.toContain('zzz');
  });
  it('mapea refs EXISTING y NEW a ids y devuelve error si una NEW no se creó', () => {
    const team = buildActionCall(
      act('CREATE_TEAM', { name: 'T' }, { parent: existing('p1') }),
      resolve,
    );
    expect(team).toMatchObject({ ok: true, value: { dto: { name: 'T', parentId: 'p1' } } });
    const member = buildActionCall(
      act('SET_TEAM_MEMBER', { isLead: true }, { team: created('ok'), user: existing('u1') }),
      resolve,
    );
    expect(member).toMatchObject({
      ok: true,
      value: {
        dtoName: 'SetMemberDto',
        dto: { isLead: true },
        ids: { team: 'new-uuid', user: 'u1' },
      },
    });
    expect(
      buildActionCall(
        act('SET_TEAM_MEMBER', { isLead: true }, { team: created('nope'), user: existing('u1') }),
        resolve,
      ),
    ).toMatchObject({ ok: false, code: 'UNKNOWN_REF' });
  });
  it('resto de tipos', () => {
    expect(
      buildActionCall(
        act('REMOVE_TEAM_MEMBER', {}, { team: existing('t'), user: existing('u') }),
        resolve,
      ),
    ).toMatchObject({ ok: true, value: { dtoName: null, ids: { team: 't', user: 'u' } } });
    expect(
      buildActionCall(act('ACTIVATE_CYCLE', {}, { cycle: existing('c') }), resolve),
    ).toMatchObject({ ok: true, value: { dto: null, ids: { cycle: 'c' } } });
    const cycle = buildActionCall(
      act(
        'CREATE_CYCLE',
        { name: 'Q', kind: 'QUARTER', startDate: 'a', endDate: 'b', committedThreshold: 0.9 },
        { parent: existing('y') },
      ),
      resolve,
    );
    expect(cycle).toMatchObject({
      ok: true,
      value: { dtoName: 'CreateCycleDto', dto: { parentId: 'y', committedThreshold: 0.9 } },
    });
    const obj = buildActionCall(
      act(
        'CREATE_OBJECTIVE',
        { title: 'T', origin: 'TOP_DOWN', objectiveType: 'COMMITTED' },
        { cycle: existing('c'), ownerTeam: existing('t') },
      ),
      resolve,
    );
    expect(obj).toMatchObject({
      ok: true,
      value: { dto: { type: 'COMMITTED', cycleId: 'c', ownerTeamId: 't', title: 'T' } },
    });
    const kr = buildActionCall(
      act(
        'CREATE_KEY_RESULT',
        { title: 'K', scoring: 'DERIVED', startValue: '0', targetValue: '10' },
        { objective: created('ok'), owner: existing('u') },
      ),
      resolve,
    );
    expect(kr).toMatchObject({
      ok: true,
      value: {
        dtoName: 'CreateKeyResultDto',
        dto: { ownerId: 'u', targetValue: '10' },
        ids: { objective: 'new-uuid' },
      },
    });
    expect(
      buildActionCall(
        act('SET_KEY_RESULT_OWNER', {}, { keyResult: existing('k'), owner: existing('u') }),
        resolve,
      ),
    ).toMatchObject({
      ok: true,
      value: { dtoName: 'UpdateKeyResultDto', dto: { ownerId: 'u' }, ids: { keyResult: 'k' } },
    });
    expect(buildActionCall(act('DROP_DB', {}), resolve)).toMatchObject({
      ok: false,
      code: 'UNKNOWN_ACTION',
    });
  });
});
