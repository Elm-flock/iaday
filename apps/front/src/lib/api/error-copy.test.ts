import { describe, expect, it } from 'vitest';
import { GENERIC_ERRORS, apiErrorCode, failureMessage } from './error-copy';

describe('failureMessage', () => {
  it('usa el copy del código de dominio si el módulo lo define', () => {
    const copy = { codes: { QUARTER_OVERLAPS_SIBLING: 'Se superpone.' } };
    expect(failureMessage({ status: 422, body: { code: 'QUARTER_OVERLAPS_SIBLING' } }, copy)).toBe(
      'Se superpone.',
    );
  });

  it('el código tiene prioridad sobre el status del módulo', () => {
    const copy = { codes: { X: 'por código' }, statuses: { 422: 'por status' } };
    expect(failureMessage({ status: 422, body: { code: 'X' } }, copy)).toBe('por código');
    expect(failureMessage({ status: 422, body: {} }, copy)).toBe('por status');
  });

  it.each([
    [0, GENERIC_ERRORS.unavailable],
    [400, GENERIC_ERRORS.invalid],
    [403, GENERIC_ERRORS.forbidden],
    [404, GENERIC_ERRORS.notFound],
    [409, GENERIC_ERRORS.conflict],
    [422, GENERIC_ERRORS.unprocessable],
    [500, GENERIC_ERRORS.server],
    [429, GENERIC_ERRORS.server],
  ])('status %i cae en el copy genérico', (status, expected) => {
    expect(failureMessage({ status })).toBe(expected);
  });

  it('apiErrorCode ignora cuerpos sin código', () => {
    expect(apiErrorCode(undefined)).toBeUndefined();
    expect(apiErrorCode({ message: 'x' })).toBeUndefined();
    expect(apiErrorCode({ code: 'A' })).toBe('A');
  });
});
