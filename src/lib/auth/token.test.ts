import { describe, expect, it } from 'vitest';
import { expiresWithin, jwtExpiry } from './token';

function jwt(payload: object): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.firma`;
}

describe('jwtExpiry', () => {
  it('lee exp sin verificar la firma', () => {
    expect(jwtExpiry(jwt({ exp: 1_700_000_000 }))).toBe(1_700_000_000);
  });

  it.each([
    undefined,
    '',
    'abc',
    'a.b.c',
    `a.${Buffer.from('{"exp":"x"}').toString('base64url')}.c`,
  ])('devuelve null para %j', (token) => {
    expect(jwtExpiry(token)).toBeNull();
  });
});

describe('expiresWithin', () => {
  const now = 1_000_000_000_000;
  const exp = now / 1000;

  it('true si falta o es ilegible', () => {
    expect(expiresWithin(undefined, 60, now)).toBe(true);
    expect(expiresWithin('basura', 60, now)).toBe(true);
  });

  it('true si vence dentro del margen', () => {
    expect(expiresWithin(jwt({ exp: exp + 30 }), 60, now)).toBe(true);
    expect(expiresWithin(jwt({ exp: exp + 60 }), 60, now)).toBe(true);
  });

  it('false si le queda más que el margen', () => {
    expect(expiresWithin(jwt({ exp: exp + 61 }), 60, now)).toBe(false);
  });
});
