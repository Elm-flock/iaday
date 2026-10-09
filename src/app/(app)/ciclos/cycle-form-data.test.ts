import { describe, expect, it } from 'vitest';
import { parseCreateCycle, parseThreshold, parseUpdateCycle } from './cycle-form-data';

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

const valid = {
  name: 'OKR 2026',
  kind: 'ANNUAL',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  checkInCadence: 'WEEKLY',
  committedThreshold: '1,00',
  aspirationalThreshold: '0,70',
};

describe('parseThreshold', () => {
  it.each([
    ['1', 1],
    ['1,00', 1],
    ['0,70', 0.7],
    ['0.7', 0.7],
    ['.5', 0.5],
    ['0,05', 0.05],
  ])('acepta %s', (raw, expected) => expect(parseThreshold(raw)).toBe(expected));

  it.each(['0', '0,00', '1,01', '2', '-0,5', 'abc', '', '0,705'])('rechaza "%s"', (raw) =>
    expect(parseThreshold(raw)).toBeNull(),
  );
});

describe('parseCreateCycle', () => {
  it('arma el body de un ciclo anual con umbrales numéricos', () => {
    expect(parseCreateCycle(form(valid))).toEqual({
      ok: true,
      body: {
        name: 'OKR 2026',
        kind: 'ANNUAL',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        checkInCadence: 'WEEKLY',
        committedThreshold: 1,
        aspirationalThreshold: 0.7,
      },
    });
  });

  it('un trimestre requiere ciclo anual padre y lo envía', () => {
    const missing = parseCreateCycle(form({ ...valid, kind: 'QUARTER' }));
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.fieldErrors.parentId).toMatch(/ciclo anual/);

    const ok = parseCreateCycle(form({ ...valid, kind: 'QUARTER', parentId: 'abc' }));
    expect(ok.ok && ok.body.parentId).toBe('abc');
  });

  it('valida nombre, fechas y umbrales con mensajes en español', () => {
    const result = parseCreateCycle(
      form({
        ...valid,
        name: ' ',
        startDate: '2026-12-31',
        endDate: '2026-01-01',
        committedThreshold: '3',
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.name).toBe('Ingresá un nombre para el ciclo.');
      expect(result.fieldErrors.endDate).toMatch(/posterior/);
      expect(result.fieldErrors.committedThreshold).toMatch(/hasta 1/);
    }
  });
});

describe('parseUpdateCycle', () => {
  it('con ciclo activo no envía fechas', () => {
    const result = parseUpdateCycle(form({ ...valid, startDate: '', endDate: '' }), {
      datesEditable: false,
    });
    expect(result.ok && 'startDate' in result.body).toBe(false);
  });

  it('en borrador envía las fechas', () => {
    const result = parseUpdateCycle(form(valid), { datesEditable: true });
    expect(result.ok && result.body.startDate).toBe('2026-01-01');
  });
});
