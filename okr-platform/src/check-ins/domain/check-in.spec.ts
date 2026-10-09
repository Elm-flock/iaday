import { assertCheckInAllowed, evaluateCheckIn } from './check-in';

const derived = { scoring: 'DERIVED' as const, startValue: 0, targetValue: 10 };
const manual = { scoring: 'MANUAL' as const, startValue: null, targetValue: null };

describe('evaluateCheckIn', () => {
  it('KR numérico: calcula score y banda a partir del valor', () => {
    expect(evaluateCheckIn(derived, { value: 5 })).toEqual({
      ok: true,
      value: { value: 5, score: 0.5, band: 'YELLOW' },
    });
  });

  it('KR numérico con target < start (a la baja)', () => {
    const down = { scoring: 'DERIVED' as const, startValue: 100, targetValue: 60 };
    expect(evaluateCheckIn(down, { value: 80 })).toMatchObject({
      ok: true,
      value: { score: 0.5 },
    });
  });

  it('clampea fuera de rango y la banda se calcula sobre el score', () => {
    expect(evaluateCheckIn(derived, { value: 15 })).toMatchObject({
      ok: true,
      value: { score: 1, band: 'GREEN' },
    });
    expect(evaluateCheckIn(derived, { value: -3 })).toMatchObject({
      ok: true,
      value: { score: 0, band: 'RED' },
    });
  });

  it('KR numérico sin valor -> CHECKIN_VALUE_REQUIRED', () => {
    expect(evaluateCheckIn(derived, {})).toMatchObject({
      ok: false,
      code: 'CHECKIN_VALUE_REQUIRED',
    });
  });

  it('KR numérico con score manual -> CHECKIN_MANUAL_SCORE_NOT_ALLOWED', () => {
    expect(evaluateCheckIn(derived, { value: 1, manualScore: 0.5 })).toMatchObject({
      ok: false,
      code: 'CHECKIN_MANUAL_SCORE_NOT_ALLOWED',
    });
  });

  it('KR binario: usa el score manual, sin valor', () => {
    expect(evaluateCheckIn(manual, { manualScore: 0.7 })).toEqual({
      ok: true,
      value: { value: null, score: 0.7, band: 'GREEN' },
    });
  });

  it('KR binario sin score -> CHECKIN_MANUAL_SCORE_REQUIRED', () => {
    expect(evaluateCheckIn(manual, {})).toMatchObject({
      ok: false,
      code: 'CHECKIN_MANUAL_SCORE_REQUIRED',
    });
  });

  it('KR binario con valor -> CHECKIN_VALUE_NOT_ALLOWED', () => {
    expect(evaluateCheckIn(manual, { value: 3, manualScore: 0.5 })).toMatchObject({
      ok: false,
      code: 'CHECKIN_VALUE_NOT_ALLOWED',
    });
  });

  it.each([0.35, 1.1, -0.1])(
    'KR binario con score %s fuera de pasos de 0.1 -> INVALID_MANUAL_SCORE',
    (s) => {
      expect(evaluateCheckIn(manual, { manualScore: s })).toMatchObject({
        ok: false,
        code: 'INVALID_MANUAL_SCORE',
      });
    },
  );

  it('KR numérico mal definido (sin start/target) -> KR_VALUES_REQUIRED', () => {
    expect(
      evaluateCheckIn({ scoring: 'DERIVED', startValue: null, targetValue: null }, { value: 1 }),
    ).toMatchObject({ ok: false, code: 'KR_VALUES_REQUIRED' });
  });
});

describe('assertCheckInAllowed', () => {
  it('PUBLISHED en ciclo ACTIVE -> ok', () => {
    expect(assertCheckInAllowed({ objectiveStatus: 'PUBLISHED', cycleStatus: 'ACTIVE' }).ok).toBe(
      true,
    );
  });
  it('DRAFT -> OBJECTIVE_NOT_PUBLISHED', () => {
    expect(assertCheckInAllowed({ objectiveStatus: 'DRAFT', cycleStatus: 'ACTIVE' })).toMatchObject(
      {
        ok: false,
        code: 'OBJECTIVE_NOT_PUBLISHED',
      },
    );
  });
  it('CLOSED -> OBJECTIVE_CLOSED', () => {
    expect(
      assertCheckInAllowed({ objectiveStatus: 'CLOSED', cycleStatus: 'ACTIVE' }),
    ).toMatchObject({
      ok: false,
      code: 'OBJECTIVE_CLOSED',
    });
  });
  it('ciclo CLOSED -> CYCLE_CLOSED', () => {
    expect(
      assertCheckInAllowed({ objectiveStatus: 'PUBLISHED', cycleStatus: 'CLOSED' }),
    ).toMatchObject({
      ok: false,
      code: 'CYCLE_CLOSED',
    });
  });
});
