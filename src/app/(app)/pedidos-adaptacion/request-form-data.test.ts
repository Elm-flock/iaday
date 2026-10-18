import { describe, expect, it } from 'vitest';
import { parseAssign, parseCreateRequest, parseDeliver, parseReject } from './request-form-data';

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const ID = '6f1c2f0e-3b8d-4a52-9c5e-1d2a3b4c5d6e';

describe('parseCreateRequest', () => {
  it('arma el cuerpo sin vínculo ni detalle', () => {
    expect(parseCreateRequest(form({ subject: ' El reporte ', preferredFormat: 'AUDIO' }))).toEqual(
      { ok: true, body: { subject: 'El reporte', preferredFormat: 'AUDIO' } },
    );
  });

  it('traduce el vínculo de la UI al tipo del back', () => {
    const r = parseCreateRequest(
      form({
        subject: 'Check-in',
        preferredFormat: 'LECTURA_FACIL',
        description: 'Detalle',
        linkType: 'check-in',
        linkId: ID,
      }),
    );
    expect(r).toEqual({
      ok: true,
      body: {
        subject: 'Check-in',
        preferredFormat: 'LECTURA_FACIL',
        description: 'Detalle',
        entityType: 'CHECK_IN',
        entityId: ID,
      },
    });
  });

  it('marca asunto, formato y vínculo inválidos', () => {
    const r = parseCreateRequest(
      form({ subject: 'x', preferredFormat: 'BRAILLE', linkType: 'cosa', linkId: 'no' }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(Object.keys(r.fieldErrors).sort()).toEqual(['link', 'preferredFormat', 'subject']);
  });

  it('un vínculo a medias (solo id) es inválido', () => {
    const r = parseCreateRequest(form({ subject: 'Algo', preferredFormat: 'OTRO', linkId: ID }));
    expect(r.ok).toBe(false);
  });

  it('respeta los máximos', () => {
    const r = parseCreateRequest(
      form({ subject: 'x'.repeat(151), preferredFormat: 'OTRO', description: 'y'.repeat(2001) }),
    );
    expect(!r.ok && Object.keys(r.fieldErrors).sort()).toEqual(['description', 'subject']);
  });
});

describe('parseAssign', () => {
  it('exige un id de persona válido', () => {
    expect(parseAssign(form({ assigneeId: ID }))).toEqual({ ok: true, body: { assigneeId: ID } });
    expect(parseAssign(form({ assigneeId: '' })).ok).toBe(false);
  });
});

describe('parseDeliver', () => {
  it('exige nota de al menos 10 caracteres y enlace http(s) si hay', () => {
    expect(parseDeliver(form({ resolutionNote: 'corta' })).ok).toBe(false);
    expect(
      parseDeliver(
        form({ resolutionNote: 'Te lo dejamos en el drive', resolutionLink: 'ftp://x' }),
      ),
    ).toMatchObject({ ok: false, fieldErrors: { resolutionLink: expect.any(String) } });
    expect(
      parseDeliver(
        form({ resolutionNote: 'javascript:alert(1)', resolutionLink: 'javascript:alert(1)' }),
      ).ok,
    ).toBe(false);
    expect(
      parseDeliver(
        form({ resolutionNote: 'Te lo dejamos en el drive', resolutionLink: 'https://x.test/doc' }),
      ),
    ).toEqual({
      ok: true,
      body: { resolutionNote: 'Te lo dejamos en el drive', resolutionLink: 'https://x.test/doc' },
    });
  });
});

describe('parseReject', () => {
  it('sin justificación (o muy corta) NO se envía: error de campo en lenguaje claro', () => {
    for (const justification of ['', '   ', 'no se puede']) {
      const r = parseReject(form({ justification }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fieldErrors.justification).toMatch(/justificación por escrito/);
    }
  });
  it('con justificación suficiente arma el cuerpo', () => {
    const text = 'Hoy no podemos hacerlo porque exige un estudio externo.';
    expect(parseReject(form({ justification: ` ${text} ` }))).toEqual({
      ok: true,
      body: { justification: text },
    });
  });
});
