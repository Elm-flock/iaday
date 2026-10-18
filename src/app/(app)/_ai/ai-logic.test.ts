import { describe, expect, it } from 'vitest';
import {
  AI_CODE_COPY,
  AI_RATE_LIMITED_COPY,
  AI_UNAVAILABLE_COPY,
  aiFailureMessage,
  isAiUnavailable,
} from './messages';
import {
  canAcceptAdaptation,
  canValidateAdaptation,
  isAdaptableEntity,
  isAdaptationLevel,
  isValidatable,
} from './policy';
import {
  buildKrSuggestInput,
  buildObjectiveSuggestInput,
  decimalForInput,
  krPrefill,
  objectivePrefill,
  SUGGEST_NEEDS_CYCLE_OWNER,
  SUGGEST_NEEDS_TITLE,
} from './suggest-input';
import { parseCheckInSummary, parseOkrSuggestion } from './suggestion-payload';

const fail = (status: number, code?: string) => ({
  status,
  body: code ? { statusCode: status, message: 'x', code } : undefined,
});

describe('aiFailureMessage (mapeo de errores del back)', () => {
  it('cubre TODOS los códigos de dominio de la IA con copy propio en voseo', () => {
    const codes = [
      'AI_DISABLED',
      'AI_UNAVAILABLE',
      'AI_RATE_LIMITED',
      'AI_INPUT_REJECTED',
      'AI_OUTPUT_INVALID',
      'AI_NOTHING_TO_ADAPT',
      'AI_NOTHING_TO_SUMMARIZE',
      'AI_ADAPTATION_NOT_FOUND',
      'AI_ADAPTATION_STATE_CONFLICT',
      'AI_SUGGESTION_ALREADY_DECIDED',
      'AI_VALIDATION_NOT_ALLOWED',
      'AI_EDITED_CONTENT_INVALID',
    ];
    for (const code of codes) {
      expect(AI_CODE_COPY[code], code).toBeTruthy();
      expect(aiFailureMessage(fail(422, code))).toBe(AI_CODE_COPY[code]);
    }
  });

  it('503 AI_DISABLED / AI_UNAVAILABLE: el resto de la plataforma funciona', () => {
    expect(aiFailureMessage(fail(503, 'AI_DISABLED'))).toBe(AI_UNAVAILABLE_COPY);
    expect(aiFailureMessage(fail(503, 'AI_UNAVAILABLE'))).toContain('El resto de la plataforma');
  });

  it('429 del throttler (sin código) y AI_RATE_LIMITED comparten copy', () => {
    expect(aiFailureMessage(fail(429))).toBe(AI_RATE_LIMITED_COPY);
    expect(aiFailureMessage(fail(429, 'AI_RATE_LIMITED'))).toBe(AI_RATE_LIMITED_COPY);
  });

  it('422 AI_INPUT_REJECTED: copy por contexto', () => {
    expect(aiFailureMessage(fail(422, 'AI_INPUT_REJECTED'), 'adapt')).toContain(
      'No pudimos adaptar este texto',
    );
    expect(aiFailureMessage(fail(422, 'AI_INPUT_REJECTED'), 'suggest')).toContain(
      'No pudimos mejorar este texto',
    );
  });

  it('502 sin código = respuesta inutilizable; caída de red = no disponible; 404/403 genéricos', () => {
    expect(aiFailureMessage(fail(502))).toBe(AI_CODE_COPY.AI_OUTPUT_INVALID);
    expect(aiFailureMessage({ status: 0 })).toBe(AI_UNAVAILABLE_COPY);
    expect(aiFailureMessage(fail(404))).toContain('No encontramos');
    expect(aiFailureMessage(fail(403))).toContain('No tenés permiso');
  });

  it('isAiUnavailable: solo apagada/caída, no los errores de negocio', () => {
    expect(isAiUnavailable(fail(503, 'AI_DISABLED'))).toBe(true);
    expect(isAiUnavailable(fail(503, 'AI_UNAVAILABLE'))).toBe(true);
    expect(isAiUnavailable(fail(503))).toBe(true);
    expect(isAiUnavailable({ status: 0 })).toBe(true);
    expect(isAiUnavailable(fail(429, 'AI_RATE_LIMITED'))).toBe(false);
    expect(isAiUnavailable(fail(422, 'AI_INPUT_REJECTED'))).toBe(false);
  });
});

describe('policy de validación (espejo del back)', () => {
  const owned = { ownerUserId: 'owner', ownerTeamId: null };
  const teamOwned = { ownerUserId: null, ownerTeamId: 't1' };
  const viewer = (over: Partial<Parameters<typeof canValidateAdaptation>[0]>) => ({
    id: 'me',
    role: 'MEMBER' as const,
    teams: [],
    ...over,
  });

  it('el feedback NUNCA es validable, ni siquiera por ADMIN', () => {
    expect(canValidateAdaptation(viewer({ role: 'ADMIN' }), 'feedback', null)).toEqual({
      allowed: false,
      reason: 'feedback',
    });
  });

  it('ADMIN valida objetivos y check-ins', () => {
    expect(canValidateAdaptation(viewer({ role: 'ADMIN' }), 'objective', owned).allowed).toBe(true);
    expect(canValidateAdaptation(viewer({ role: 'ADMIN' }), 'check-in', teamOwned).allowed).toBe(
      true,
    );
  });

  it('líder del equipo dueño valida; líder de otro equipo no', () => {
    const lead = viewer({ teams: [{ teamId: 't1', isLead: true, name: 'T1' }] as never });
    const other = viewer({ teams: [{ teamId: 't9', isLead: true, name: 'T9' }] as never });
    expect(canValidateAdaptation(lead, 'objective', teamOwned).allowed).toBe(true);
    expect(canValidateAdaptation(other, 'objective', teamOwned)).toEqual({
      allowed: false,
      reason: 'permission',
    });
  });

  it('individual: quien lidera algún equipo valida lo de otra persona, pero el dueño no se autovalida', () => {
    const lead = [{ teamId: 't1', isLead: true, name: 'T1' }] as never;
    expect(canValidateAdaptation(viewer({ teams: lead }), 'check-in', owned).allowed).toBe(true);
    expect(
      canValidateAdaptation(viewer({ id: 'owner', teams: lead }), 'check-in', owned).allowed,
    ).toBe(false);
  });

  it('el rol global LEADER sin ser líder de ningún equipo no alcanza', () => {
    expect(canValidateAdaptation(viewer({ role: 'LEADER' }), 'check-in', owned).allowed).toBe(
      false,
    );
  });

  it('un MEMBER no valida y sin dueño conocido tampoco', () => {
    expect(canValidateAdaptation(viewer({}), 'objective', owned).allowed).toBe(false);
    expect(canValidateAdaptation(viewer({ role: 'ADMIN' }), 'objective', null).allowed).toBe(false);
  });

  it('solo quien la pidió puede marcar "Me sirve"; VALIDATED es terminal', () => {
    expect(canAcceptAdaptation('me', 'me')).toBe(true);
    expect(canAcceptAdaptation('me', 'otra')).toBe(false);
    expect(canAcceptAdaptation('me', null)).toBe(false);
    expect(isValidatable('DRAFT')).toBe(true);
    expect(isValidatable('NEEDS_REVIEW')).toBe(true);
    expect(isValidatable('VALIDATED')).toBe(false);
  });

  it('valida entidad y nivel que llegan del cliente', () => {
    expect(isAdaptableEntity('check-in')).toBe(true);
    expect(isAdaptableEntity('key-result')).toBe(false);
    expect(isAdaptationLevel('PLAIN')).toBe(true);
    expect(isAdaptationLevel('HARD')).toBe(false);
  });
});

describe('payloads del agente', () => {
  it('parseOkrSuggestion: estrecha y descarta lo malformado', () => {
    const parsed = parseOkrSuggestion({
      objective: {
        title: 'Dar soporte rápido',
        description: null,
        rationale: 'Un objetivo es un resultado',
      },
      keyResults: [
        {
          title: 'Bajar P1 de 8 h a 4 h',
          unit: 'h',
          startValue: '8',
          targetValue: '4',
          rationale: 'r',
          proposedValues: true,
        },
        { sinTitulo: true },
      ],
      warnings: [{ code: 'TOO_FEW_KRS', message: 'Sumá al menos uno más.' }, { code: 'X' }],
    });
    expect(parsed?.objective.title).toBe('Dar soporte rápido');
    expect(parsed?.keyResults).toHaveLength(1);
    expect(parsed?.keyResults[0].proposedValues).toBe(true);
    expect(parsed?.warnings).toEqual([{ code: 'TOO_FEW_KRS', message: 'Sumá al menos uno más.' }]);
    expect(parseOkrSuggestion(null)).toBeNull();
    expect(parseOkrSuggestion({ objective: {} })).toBeNull();
  });

  it('parseCheckInSummary: tendencia desconocida cae en "pocos datos"', () => {
    expect(
      parseCheckInSummary({ summary: 'Avanza', trend: 'RARA', highlights: ['a', 1], risks: [] }),
    ).toEqual({ summary: 'Avanza', trend: 'INSUFFICIENT_DATA', highlights: ['a'], risks: [] });
    expect(parseCheckInSummary({ trend: 'STABLE' })).toBeNull();
  });
});

const fd = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe('armado del pedido de "Sugerir redacción"', () => {
  it('objetivo: exige título, ciclo y responsable; tipo por defecto COMPROMETIDO', () => {
    expect(buildObjectiveSuggestInput(fd({ title: ' ' }))).toEqual({
      ok: false,
      message: SUGGEST_NEEDS_TITLE,
    });
    expect(buildObjectiveSuggestInput(fd({ title: 'mejorar soporte' }))).toEqual({
      ok: false,
      message: SUGGEST_NEEDS_CYCLE_OWNER,
    });
    expect(
      buildObjectiveSuggestInput(
        fd({ title: 'mejorar soporte', cycleId: 'c1', owner: 'team:t1', description: ' d ' }),
      ),
    ).toEqual({
      ok: true,
      input: {
        cycleId: 'c1',
        ownerTeamId: 't1',
        draft: { title: 'mejorar soporte', type: 'COMMITTED', description: 'd' },
      },
    });
    const user = buildObjectiveSuggestInput(
      fd({ title: 't', cycleId: 'c1', owner: 'user:u1', type: 'ASPIRATIONAL' }),
    );
    expect(user.ok && user.input.ownerUserId).toBe('u1');
    expect(user.ok && user.input.draft.type).toBe('ASPIRATIONAL');
  });

  it('KR: el objetivo existente da contexto y los números es-AR se mandan como decimales', () => {
    const objective = {
      id: 'o1',
      cycleId: 'c1',
      title: 'Soporte',
      description: null,
      type: 'COMMITTED' as const,
    };
    expect(buildKrSuggestInput(fd({ title: '' }), objective).ok).toBe(false);
    const built = buildKrSuggestInput(
      fd({ title: 'bajar P1', unit: 'h', startValue: '8,5', targetValue: '4' }),
      objective,
    );
    expect(built).toEqual({
      ok: true,
      input: {
        cycleId: 'c1',
        objectiveId: 'o1',
        draft: {
          title: 'Soporte',
          type: 'COMMITTED',
          keyResults: [{ title: 'bajar P1', unit: 'h', startValue: '8.5', targetValue: '4' }],
        },
      },
    });
  });

  it('precarga: formatea es-AR y respeta los máximos del formulario', () => {
    expect(decimalForInput('12.5')).toBe('12,50');
    expect(decimalForInput('100')).toBe('100');
    expect(decimalForInput(null)).toBe('');
    expect(
      krPrefill({
        title: 'x'.repeat(300),
        unit: null,
        startValue: '0',
        targetValue: '1000.5',
        rationale: '',
        proposedValues: true,
      }),
    ).toEqual({ title: 'x'.repeat(200), unit: '', startValue: '0', targetValue: '1.000,50' });
    expect(objectivePrefill({ title: 'T', description: null })).toEqual({ title: 'T' });
  });
});
