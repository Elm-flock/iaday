import {
  MIN_REJECTION_LENGTH,
  assignTransition,
  canLinkFeedback,
  computeDueDate,
  deliverTransition,
  isOverdue,
  rejectTransition,
  validateAssignee,
} from './transitions';

const LONG = 'x'.repeat(MIN_REJECTION_LENGTH);

describe('computeDueDate', () => {
  it('suma N días corridos al alta', () => {
    expect(computeDueDate(new Date('2026-10-01T00:00:00Z'), 10).toISOString()).toBe(
      '2026-10-11T00:00:00.000Z',
    );
  });
  it('un valor inválido cae en 10 días', () => {
    const base = new Date('2026-10-01T00:00:00Z');
    for (const bad of [0, -3, 1.5, Number.NaN]) {
      expect(computeDueDate(base, bad).toISOString()).toBe('2026-10-11T00:00:00.000Z');
    }
  });
});

describe('isOverdue', () => {
  const now = new Date('2026-10-20T00:00:00Z');
  const past = new Date('2026-10-19T00:00:00Z');
  const future = new Date('2026-10-21T00:00:00Z');
  it('abierto y pasado de fecha: vencido', () => {
    expect(isOverdue({ status: 'PENDIENTE', dueDate: past }, now)).toBe(true);
    expect(isOverdue({ status: 'EN_CURSO', dueDate: past }, now)).toBe(true);
  });
  it('en fecha o resuelto: nunca vencido', () => {
    expect(isOverdue({ status: 'PENDIENTE', dueDate: future }, now)).toBe(false);
    expect(isOverdue({ status: 'ENTREGADA', dueDate: past }, now)).toBe(false);
    expect(isOverdue({ status: 'RECHAZADA', dueDate: past }, now)).toBe(false);
  });
});

describe('assignTransition', () => {
  it('PENDIENTE y EN_CURSO pasan a EN_CURSO', () => {
    expect(assignTransition('PENDIENTE')).toEqual({ ok: true, value: 'EN_CURSO' });
    expect(assignTransition('EN_CURSO')).toEqual({ ok: true, value: 'EN_CURSO' });
  });
  it('resuelto -> conflicto', () => {
    expect(assignTransition('ENTREGADA')).toMatchObject({
      ok: false,
      code: 'ADAPTATION_REQUEST_STATE_CONFLICT',
    });
    expect(assignTransition('RECHAZADA')).toMatchObject({ ok: false });
  });
});

describe('deliverTransition', () => {
  it('con nota suficiente entrega desde PENDIENTE o EN_CURSO', () => {
    expect(deliverTransition('PENDIENTE', 'Te dejamos el documento')).toEqual({
      ok: true,
      value: 'ENTREGADA',
    });
    expect(deliverTransition('EN_CURSO', 'Te dejamos el documento').ok).toBe(true);
  });
  it('sin nota o muy corta -> 422 de nota', () => {
    for (const note of [undefined, null, '', '   ', 'corta']) {
      expect(deliverTransition('EN_CURSO', note)).toMatchObject({
        ok: false,
        code: 'ADAPTATION_DELIVERY_NOTE_REQUIRED',
      });
    }
  });
  it('resuelto -> conflicto (aunque falte la nota)', () => {
    expect(deliverTransition('ENTREGADA', undefined)).toMatchObject({
      code: 'ADAPTATION_REQUEST_STATE_CONFLICT',
    });
  });
});

describe('rejectTransition', () => {
  it('con justificación suficiente rechaza', () => {
    expect(rejectTransition('PENDIENTE', LONG)).toEqual({ ok: true, value: 'RECHAZADA' });
    expect(rejectTransition('EN_CURSO', LONG).ok).toBe(true);
  });
  it('sin justificación, vacía o solo espacios -> código de justificación', () => {
    for (const j of [undefined, null, '', ' '.repeat(40), 'no se puede']) {
      expect(rejectTransition('PENDIENTE', j)).toMatchObject({
        ok: false,
        code: 'ADAPTATION_REJECTION_JUSTIFICATION_REQUIRED',
      });
    }
  });
  it('resuelto -> conflicto', () => {
    expect(rejectTransition('RECHAZADA', LONG)).toMatchObject({
      code: 'ADAPTATION_REQUEST_STATE_CONFLICT',
    });
    expect(rejectTransition('ENTREGADA', LONG).ok).toBe(false);
  });
});

describe('validateAssignee', () => {
  it('solo ADMIN activo', () => {
    expect(validateAssignee({ role: 'ADMIN', active: true }).ok).toBe(true);
    expect(validateAssignee({ role: 'LEADER', active: true })).toMatchObject({
      code: 'ADAPTATION_ASSIGNEE_INVALID',
    });
    expect(validateAssignee({ role: 'ADMIN', active: false }).ok).toBe(false);
    expect(validateAssignee(null).ok).toBe(false);
  });
});

describe('canLinkFeedback', () => {
  const fb = { fromUserId: 'a', toUserId: 'b' };
  it('solo emisor y receptor', () => {
    expect(canLinkFeedback('a', fb)).toBe(true);
    expect(canLinkFeedback('b', fb)).toBe(true);
    expect(canLinkFeedback('c', fb)).toBe(false);
  });
});
