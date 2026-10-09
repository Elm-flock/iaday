import { describe, expect, it } from 'vitest';
import { loginUrlPath, safeNext } from './redirect';

describe('safeNext', () => {
  it.each([
    ['/okrs', '/okrs'],
    ['/okrs/123?tab=kr#top', '/okrs/123?tab=kr#top'],
    ['/', '/'],
  ])('acepta la ruta relativa %s', (raw, expected) => {
    expect(safeNext(raw)).toBe(expected);
  });

  it.each([
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    '/\\/evil.com',
    'javascript:alert(1)',
    'okrs',
    '/ok\nrs',
    '',
    undefined,
    null,
    42,
  ])('rechaza %j y cae a la home', (raw) => {
    expect(safeNext(raw)).toBe('/');
  });

  it('no vuelve a /login (evita bucles)', () => {
    expect(safeNext('/login?next=/okrs')).toBe('/');
  });

  it('usa el fallback indicado', () => {
    expect(safeNext('//x.com', '/inicio')).toBe('/inicio');
  });
});

describe('loginUrlPath', () => {
  it('codifica la ruta original', () => {
    expect(loginUrlPath('/okrs?a=1')).toBe('/login?next=%2Fokrs%3Fa%3D1');
  });

  it('omite next si es la home o es inválido', () => {
    expect(loginUrlPath('/')).toBe('/login');
    expect(loginUrlPath('//evil.com')).toBe('/login');
  });
});
