import { describe, expect, it } from 'vitest';
import { parseCreateFeedback, parseUpdateFeedback } from './feedback-form-data';
import { CONTENT_MAX, FEEDBACK_ERROR_COPY, PRIVACY_NOTICE } from './messages';
import { canModifyFeedback, excerpt, feedbackRole, isUnread } from './policy';
import { failureMessage } from '@/lib/api/error-copy';

const fb = (over = {}) => ({
  fromUserId: 'a',
  toUserId: 'b',
  readAt: null as string | null,
  ...over,
});

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

describe('políticas de feedback', () => {
  it('sin leer solo para el receptor y mientras no haya readAt', () => {
    expect(isUnread('b', fb())).toBe(true);
    expect(isUnread('b', fb({ readAt: '2026-01-01T10:00:00Z' }))).toBe(false);
    // El emisor nunca ve su propio envío como "sin leer".
    expect(isUnread('a', fb())).toBe(false);
  });

  it('el rol sale de emisor/receptor; un tercero no tiene rol', () => {
    expect(feedbackRole('a', fb())).toBe('author');
    expect(feedbackRole('b', fb())).toBe('receiver');
    expect(feedbackRole('c', fb())).toBeNull();
  });

  it('solo el autor modifica', () => {
    expect(canModifyFeedback('a', fb())).toBe(true);
    expect(canModifyFeedback('b', fb())).toBe(false);
  });

  it('excerpt resume sin cortar palabras ni tocar textos cortos', () => {
    expect(excerpt('Hola   mundo')).toBe('Hola mundo');
    const long = 'palabra '.repeat(40);
    const short = excerpt(long, 50);
    expect(short.length).toBeLessThanOrEqual(51);
    expect(short.endsWith('…')).toBe(true);
    expect(short).not.toMatch(/palabr…$/);
  });
});

describe('parseo de feedback', () => {
  it('exige destinatario y mensaje', () => {
    const r = parseCreateFeedback(form({ toUserId: '', content: '  ' }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors.toUserId).toBeDefined();
      expect(r.fieldErrors.content).toBeDefined();
    }
  });

  it('limita el mensaje a 2000', () => {
    const r = parseCreateFeedback(form({ toUserId: 'b', content: 'x'.repeat(CONTENT_MAX + 1) }));
    expect(r.ok).toBe(false);
  });

  it('el enlace es opcional y se traduce a objectiveId/keyResultId', () => {
    const plain = parseCreateFeedback(form({ toUserId: 'b', content: 'hola', link: '' }));
    expect(plain).toEqual({ ok: true, body: { toUserId: 'b', content: 'hola' } });
    const kr = parseCreateFeedback(form({ toUserId: 'b', content: 'hola', link: 'kr:o1:k1' }));
    expect(kr).toEqual({
      ok: true,
      body: { toUserId: 'b', content: 'hola', objectiveId: 'o1', keyResultId: 'k1' },
    });
  });

  it('la edición valida solo el mensaje', () => {
    expect(parseUpdateFeedback(form({ content: '' })).ok).toBe(false);
    expect(parseUpdateFeedback(form({ content: ' nuevo ' }))).toEqual({
      ok: true,
      body: { content: 'nuevo' },
    });
  });
});

describe('copy de feedback', () => {
  it('el aviso de privacidad es el acordado', () => {
    expect(PRIVACY_NOTICE).toBe('Solo vos y la otra persona pueden ver este feedback.');
  });

  it('autoenvío (400 del back): qué pasó y cómo seguir', () => {
    const msg = failureMessage({ status: 400, body: { message: 'x' } }, FEEDBACK_ERROR_COPY);
    expect(msg).toMatch(/no sea para vos mismo/);
    expect(msg).not.toMatch(/!/);
  });

  it('403 y 404 tienen copy propio', () => {
    expect(failureMessage({ status: 403 }, FEEDBACK_ERROR_COPY)).toMatch(/Solo quien escribió/);
    expect(failureMessage({ status: 404 }, FEEDBACK_ERROR_COPY)).toMatch(/No encontramos/);
  });
});
