import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  ACTION_LABEL,
  actorLabel,
  dayEndIso,
  dayStartIso,
  describeChanges,
  entityLabel,
  isAuditAction,
  isViaAssistant,
  parseDay,
} from './audit-diff';

const people = new Map([
  ['u1', 'Ana Pérez'],
  ['adm', 'Admin Flock'],
]);

describe('etiquetas de acción', () => {
  it('rotulan TODAS las acciones del back (incluidas las de IA y las de pedidos) en español', () => {
    expect(ACTIONS).toHaveLength(23);
    for (const a of [
      'AI_CONTENT_ADAPTED',
      'AI_CONTENT_VALIDATED',
      'AI_SUGGESTION_ACCEPTED',
      'ADAPTATION_REQUEST_CREATED',
      'ADAPTATION_REQUEST_ASSIGNED',
      'ADAPTATION_REQUEST_DELIVERED',
      'ADAPTATION_REQUEST_REJECTED',
      'REFRESH_REUSE_DETECTED',
      'REFRESH_REVOKED_USED',
      'USER_PASSWORD_CHANGED',
      'ASSISTANT_PLAN_CONFIRMED',
      'ASSISTANT_PLAN_DISCARDED',
      'ASSISTANT_ACTION_EXECUTED',
      'ASSISTANT_ACTION_FAILED',
    ]) {
      expect(isAuditAction(a)).toBe(true);
    }
    for (const label of Object.values(ACTION_LABEL)) {
      expect(label).toMatch(/^[A-ZÁÉÍÓÚ]/);
      expect(label).not.toMatch(/_/);
    }
    expect(new Set(Object.values(ACTION_LABEL)).size).toBe(ACTIONS.length);
  });

  it('isAuditAction rechaza lo desconocido', () => {
    expect(isAuditAction('NOPE')).toBe(false);
    expect(isAuditAction(undefined)).toBe(false);
  });

  it('entityLabel: tipos conocidos en español y fallback neutro', () => {
    expect(entityLabel('KeyResult')).toBe('Resultado clave');
    expect(entityLabel('AdaptationRequest')).toBe('Pedido de documento adaptado');
    expect(entityLabel('Algo')).toBe('Otro elemento');
  });
});

describe('actorLabel', () => {
  it('nombre; "Usuario eliminado" si actorId es nulo; fallback si no está en el directorio', () => {
    expect(actorLabel('u1', people)).toBe('Ana Pérez');
    expect(actorLabel(null, people)).toBe('Usuario eliminado');
    expect(actorLabel('zzz', people)).toBe('Persona no disponible');
  });
});

describe('describeChanges', () => {
  it('cambio de estado: antes y después con etiquetas en español', () => {
    expect(
      describeChanges({
        entityType: 'Objective',
        before: { status: 'DRAFT' },
        after: { status: 'PUBLISHED' },
      }),
    ).toEqual([{ field: 'status', label: 'Estado', before: 'Borrador', after: 'Publicado' }]);
  });

  it('cambio de rol con el nombre del rol de la UI y puntajes en formato es-AR', () => {
    const role = describeChanges({
      entityType: 'User',
      before: { role: 'MEMBER' },
      after: { role: 'LEADER' },
    });
    expect(role[0]).toMatchObject({ before: 'Integrante', after: 'Líder' });

    const score = describeChanges({
      entityType: 'KeyResult',
      before: { score: 0.5, value: '40.0000' },
      after: { score: 0.7, value: '60', checkInId: 'x' },
    });
    expect(score.map((c) => [c.label, c.before, c.after])).toEqual([
      ['Puntaje', '0,50', '0,70'],
      ['Valor', '40', '60'],
    ]);
  });

  it('solo muestra "después" cuando no hay "antes" y omite lo que no cambió', () => {
    const changes = describeChanges({
      entityType: 'AdaptedContent',
      before: null,
      after: { status: 'DRAFT', level: 'EASY_READ', humanEdited: false },
    });
    expect(changes.map((c) => [c.label, c.before, c.after])).toEqual([
      ['Estado', null, 'Borrador'],
      ['Nivel', null, 'Lectura fácil'],
      ['Corregida por una persona', null, 'No'],
    ]);
    expect(
      describeChanges({
        entityType: 'Cycle',
        before: { status: 'ACTIVE', closedObjectives: 2 },
        after: { status: 'ACTIVE', closedObjectives: 2 },
      }),
    ).toEqual([]);
  });

  it('el responsable se muestra por nombre, no por id', () => {
    const [c] = describeChanges(
      {
        entityType: 'AdaptationRequest',
        before: { status: 'PENDIENTE', assigneeId: null },
        after: { status: 'EN_CURSO', assigneeId: 'adm' },
      },
      { people },
    ).filter((x) => x.field === 'assigneeId');
    expect(c).toMatchObject({ before: 'Sin dato', after: 'Admin Flock' });
  });

  it('PRIVACIDAD: nunca muestra ids técnicos, trazas ni claves desconocidas (como "content")', () => {
    const changes = describeChanges({
      entityType: 'AdaptedContent',
      before: { status: 'DRAFT', promptId: 'p', content: 'texto privado' },
      after: {
        status: 'VALIDATED',
        traceId: '3b1f6c2e',
        adaptedContentId: 'a1',
        content: 'texto privado',
        message: 'otro texto',
      },
    });
    expect(JSON.stringify(changes)).not.toMatch(/privado|traceId|3b1f6c2e|otro texto|prompt/);
    expect(changes).toHaveLength(1);
  });

  it('PRIVACIDAD: un registro sobre feedback no muestra ningún detalle', () => {
    expect(
      describeChanges({
        entityType: 'Feedback',
        before: { status: 'DRAFT' },
        after: { status: 'PUBLISHED', content: 'Tu presentación fue floja' },
      }),
    ).toEqual([]);
  });

  it('tolera before/after nulos o no-objeto', () => {
    expect(describeChanges({ entityType: 'User', before: null, after: null })).toEqual([]);
  });
});

describe('fechas del filtro', () => {
  it('parseDay acepta solo días reales del calendario', () => {
    expect(parseDay('2026-10-18')).toBe('2026-10-18');
    expect(parseDay('2026-02-30')).toBeUndefined();
    expect(parseDay('18/10/2026')).toBeUndefined();
    expect(parseDay(undefined)).toBeUndefined();
  });

  it('el día argentino va de las 00:00 a las 23:59:59.999 (UTC-3)', () => {
    expect(dayStartIso('2026-10-18')).toBe('2026-10-18T03:00:00.000Z');
    expect(dayEndIso('2026-10-18')).toBe('2026-10-19T02:59:59.999Z');
  });
});

describe('asistente en la auditoría', () => {
  it('rotula las acciones nuevas tal como las pide el producto', () => {
    expect(ACTION_LABEL.USER_PASSWORD_CHANGED).toBe('Cambio de contraseña');
    expect(ACTION_LABEL.ASSISTANT_PLAN_CONFIRMED).toBe('Plan del asistente confirmado');
    expect(ACTION_LABEL.ASSISTANT_PLAN_DISCARDED).toBe('Plan del asistente descartado');
    expect(ACTION_LABEL.ASSISTANT_ACTION_EXECUTED).toBe('Acción del asistente ejecutada');
    expect(ACTION_LABEL.ASSISTANT_ACTION_FAILED).toBe('Acción del asistente fallida');
    expect(entityLabel('AssistantPlan')).toBe('Plan del asistente');
  });

  it('isViaAssistant reconoce via:assistant y nada más', () => {
    expect(isViaAssistant({ after: { via: 'assistant', planId: 'p' } })).toBe(true);
    expect(isViaAssistant({ after: { via: 'ui' } })).toBe(false);
    expect(isViaAssistant({ after: null })).toBe(false);
    expect(isViaAssistant({ after: ['assistant'] as unknown as Record<string, unknown> })).toBe(
      false,
    );
  });

  it('muestra la acción ejecutada en español y oculta planId/step', () => {
    const changes = describeChanges({
      entityType: 'User',
      before: null,
      after: {
        via: 'assistant',
        planId: 'abc',
        step: 2,
        actionType: 'CREATE_USER',
        errorCode: 'CONFLICT',
      },
    });
    expect(changes).toEqual([
      { field: 'actionType', label: 'Acción', before: null, after: 'Crear usuario' },
      { field: 'errorCode', label: 'Motivo del error', before: null, after: 'CONFLICT' },
    ]);
  });
});
