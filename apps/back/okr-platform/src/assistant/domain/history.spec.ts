import {
  describePlanForHistory,
  invalidPlanReply,
  pendingPlanNote,
  type HistoryPlan,
} from './history';

const NOW = new Date('2026-10-18T12:00:00Z');
const FUTURE = new Date('2026-10-18T12:15:00Z');
const PAST = new Date('2026-10-18T11:00:00Z');

const plan = (over: Partial<HistoryPlan> = {}): HistoryPlan => ({
  status: 'PROPOSED',
  summary: 'Creo el ciclo anual 2027.',
  expiresAt: FUTURE,
  actions: [
    {
      type: 'CREATE_CYCLE',
      description: 'Crear el ciclo "Año 2027" (anual, del 2027-01-01 al 2027-12-31)',
    },
    {
      type: 'CREATE_USER',
      description: 'Crear el usuario Lucía (lucia@x.com) con rol Integrante',
      params: { name: 'Lucía', email: 'lucia@x.com' },
    },
    {
      type: 'CREATE_CYCLE',
      description: 'Crear el ciclo "Q1 2027" (trimestral, del 2027-01-01 al 2027-03-31)',
    },
  ],
  issues: [],
  steps: null,
  ...over,
});

describe('describePlanForHistory', () => {
  it('PROPUESTO vigente: avisa que nada existe aún, sin emails', () => {
    const t = describePlanForHistory(plan(), NOW);
    expect(t).toContain('[Plan PROPUESTO, todavía sin confirmar: nada de esto existe aún.');
    expect(t).toContain('Crear el usuario Lucía');
    expect(t).not.toContain('lucia@x.com');
    expect(t).not.toContain('Sigue pendiente');
  });

  it('PROPUESTO y pendiente ahora: agrega el aviso para el plan nuevo', () => {
    expect(describePlanForHistory(plan(), NOW, { pendingNow: true })).toContain(
      'Sigue pendiente de confirmación ahora',
    );
  });

  it('PROPUESTO con fecha vencida o EXPIRED -> VENCIDO', () => {
    expect(describePlanForHistory(plan({ expiresAt: PAST }), NOW)).toContain(
      '[Plan VENCIDO: no se ejecutó',
    );
    expect(describePlanForHistory(plan({ status: 'EXPIRED' }), NOW)).toContain('[Plan VENCIDO');
  });

  it('DESCARTADO, EN EJECUCIÓN e INTERRUMPIDO', () => {
    expect(describePlanForHistory(plan({ status: 'DISCARDED' }), NOW)).toContain(
      '[Plan DESCARTADO',
    );
    expect(describePlanForHistory(plan({ status: 'EXECUTING' }), NOW)).toContain(
      '[Plan EN EJECUCIÓN',
    );
    expect(describePlanForHistory(plan({ status: 'INTERRUPTED' }), NOW)).toContain(
      '[Plan INTERRUMPIDO',
    );
  });

  it('EJECUTADO lista lo que se hizo', () => {
    const t = describePlanForHistory(plan({ status: 'EXECUTED' }), NOW);
    expect(t).toContain('[Plan EJECUTADO: se hizo todo y ya existe.');
    expect(t).toContain('Crear el ciclo "Año 2027"');
  });

  it('PARCIAL: qué se hizo, qué falló y por qué, y qué no se hizo; sin emails ni ids', () => {
    const t = describePlanForHistory(
      plan({
        status: 'PARTIAL',
        steps: [
          { index: 0, status: 'OK' },
          {
            index: 1,
            status: 'FAILED',
            error: {
              code: 'X',
              message: 'El email lucia@x.com ya existe (3f2b8c1e-1111-4222-8333-444455556666).',
            },
          },
          { index: 2, status: 'SKIPPED' },
        ],
      }),
      NOW,
    );
    expect(t).toContain('[Plan PARCIAL: se hizo Crear el ciclo "Año 2027"');
    expect(t).toContain('falló Crear el usuario Lucía por El email [email] ya existe ([id])');
    expect(t).toContain('no se hizo Crear el ciclo "Q1 2027"');
    expect(t).not.toMatch(/@x\.com|3f2b8c1e/);
  });

  it('FALLIDO e INVÁLIDO', () => {
    const failed = describePlanForHistory(
      plan({
        status: 'FAILED',
        steps: [{ index: 0, status: 'FAILED', error: { code: 'X', message: 'Algo falló.' } }],
      }),
      NOW,
    );
    expect(failed).toContain('por Algo falló. No se cambió nada.]');
    const invalid = describePlanForHistory(
      plan({ status: 'INVALID', issues: [{ message: 'Falta el anual.' }] }),
      NOW,
    );
    expect(invalid).toContain('[Plan INVÁLIDO: no se pudo ejecutar y nada de esto existe.');
    expect(invalid).toContain('Problemas: Falta el anual');
  });

  it('PARCIAL sin pasos guardados no rompe', () => {
    expect(describePlanForHistory(plan({ status: 'PARTIAL' }), NOW)).toContain('[Plan PARCIAL');
  });
});

describe('invalidPlanReply / pendingPlanNote', () => {
  it('lista los motivos en lenguaje claro y propone qué hacer; traduce handles y quita el código de dominio', () => {
    const t = invalidPlanReply([
      {
        code: 'DTO_INVALID',
        message: 'Un ciclo trimestral necesita un ciclo anual. (QUARTER_REQUIRES_ANNUAL_PARENT)',
      },
      {
        code: 'UNKNOWN_HANDLE',
        message: 'La referencia "C3" (cycle) no existe o no es del tipo esperado.',
      },
      { code: 'UNGROUNDED', message: 'x' },
      { code: 'OTRO', message: 'Otro motivo.' },
    ]);
    expect(t).toContain('no se puede ejecutar:');
    expect(t).toContain('- Un ciclo trimestral necesita un ciclo anual.');
    expect(t).not.toContain('QUARTER_REQUIRES_ANNUAL_PARENT');
    expect(t).not.toContain('"C3"');
    expect(t).toContain('algo que todavía no existe');
    expect(t).toContain('no se corresponde con lo que pediste');
    expect(t).toContain('Qué podés hacer:');
    expect(invalidPlanReply([{ code: 'OTRO', message: 'm' }])).toContain(
      'volvé a pedirlo con más detalle',
    );
  });

  it('la nota del plan pendiente nombra el resumen', () => {
    expect(pendingPlanNote('Creo el ciclo anual 2027.')).toBe(
      'Tenés un plan anterior sin confirmar: Creo el ciclo anual 2027. Si no lo querés, descartalo antes de confirmar este.',
    );
  });
});
