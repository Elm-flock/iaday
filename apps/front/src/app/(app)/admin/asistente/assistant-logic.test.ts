import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_COPY,
  EXECUTION_HEADLINE,
  ISSUE_TITLE,
  PLAN_STATUS_LABEL,
  STEP_STATUS,
  assistantFailure,
  internalHref,
} from './messages';

const body = (code: string) => ({ statusCode: 0, message: 'x', code });

describe('assistantFailure (mapeo de errores)', () => {
  it.each([
    [503, 'AI_UNAVAILABLE', 'unavailable'],
    [503, 'AI_DISABLED', 'unavailable'],
    [422, 'AI_INPUT_REJECTED', 'rejected'],
    [410, 'ASSISTANT_PLAN_EXPIRED', 'expired'],
    [409, 'ASSISTANT_PLAN_HASH_MISMATCH', 'hash-mismatch'],
    [409, 'ASSISTANT_PLAN_ALREADY_DECIDED', 'already-decided'],
    [422, 'ASSISTANT_PLAN_INVALID', 'invalid'],
    [404, 'ASSISTANT_PLAN_NOT_FOUND', 'not-found'],
  ])('%s %s -> %s', (status, code, kind) => {
    expect(assistantFailure({ status, body: body(code) }).kind).toBe(kind);
  });

  it('429 sin código: demasiados pedidos', () => {
    const f = assistantFailure({ status: 429 });
    expect(f).toEqual({ kind: 'throttled', message: ASSISTANT_COPY.throttled });
  });

  it('502/503 sin código y caída de red: no disponible (nota no bloqueante)', () => {
    expect(assistantFailure({ status: 502 }).kind).toBe('unavailable');
    expect(assistantFailure({ status: 503 }).kind).toBe('unavailable');
    expect(assistantFailure({ status: 0 })).toEqual({
      kind: 'unavailable',
      message: ASSISTANT_COPY.network,
    });
  });

  it('un 422 sin código es "rechazado" al enviar y "inválido" al confirmar', () => {
    expect(assistantFailure({ status: 422 }, 'send').kind).toBe('rejected');
    expect(assistantFailure({ status: 422 }, 'confirm').kind).toBe('invalid');
  });

  it('404 y 500 genéricos', () => {
    expect(assistantFailure({ status: 404 }).kind).toBe('not-found');
    expect(assistantFailure({ status: 500 }).kind).toBe('generic');
  });

  it('todos los mensajes están en es-AR, dicen qué pasó y no filtran códigos técnicos', () => {
    for (const message of Object.values(ASSISTANT_COPY)) {
      expect(message).not.toMatch(/[A-Z]+_[A-Z_]+/);
      expect(message.length).toBeGreaterThan(10);
    }
    expect(ASSISTANT_COPY.rejected).toMatch(/Tu texto sigue en el cuadro/);
    expect(ASSISTANT_COPY.unavailable).toMatch(/resto de la plataforma funciona/);
  });
});

describe('copy de estados', () => {
  it('cada estado de plan y de paso tiene palabra (nunca solo color)', () => {
    for (const status of [
      'PROPOSED',
      'INVALID',
      'EXECUTING',
      'EXECUTED',
      'PARTIAL',
      'FAILED',
      'INTERRUPTED',
      'DISCARDED',
      'EXPIRED',
    ]) {
      expect(PLAN_STATUS_LABEL[status]).toBeTruthy();
    }
    expect(STEP_STATUS).toEqual({ OK: 'Hecho', FAILED: 'Falló', SKIPPED: 'No se hizo' });
    expect(EXECUTION_HEADLINE.PARTIAL).toMatch(/una parte/);
  });

  it('los códigos de problema del back tienen título legible', () => {
    for (const code of ['EMAIL_TAKEN', 'UNGROUNDED', 'OBJECTIVE_LIMIT', 'CREATES_ADMIN']) {
      expect(ISSUE_TITLE[code]).toBeTruthy();
    }
  });
});

describe('internalHref', () => {
  it('acepta rutas internas', () => {
    expect(internalHref('/admin/auditoria?accion=X')).toBe('/admin/auditoria?accion=X');
    expect(internalHref('/ayuda/admin#cómo-creo-un-usuario')).toBe(
      '/ayuda/admin#cómo-creo-un-usuario',
    );
  });

  it('rechaza externos, protocol-relative, con barra invertida o vacíos', () => {
    for (const bad of [
      'https://evil.com',
      '//evil.com',
      '/\\evil',
      '',
      null,
      undefined,
      'javascript:x',
    ]) {
      expect(internalHref(bad as string | null | undefined)).toBeNull();
    }
  });
});
