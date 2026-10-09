import { describe, expect, it } from 'vitest';
import { cookieOptions, sessionMaxAges } from './constants';

describe('sessionMaxAges', () => {
  const now = Date.parse('2026-10-09T12:00:00Z');

  it('deriva los maxAge de los vencimientos', () => {
    const ages = sessionMaxAges(
      { accessExpiresAt: '2026-10-09T12:15:00Z', refreshExpiresAt: '2026-10-16T12:00:00Z' },
      now,
    );
    expect(ages).toEqual({ access: 900, refresh: 604_800 });
  });

  it('usa un respaldo si la fecha es inválida o pasada', () => {
    const ages = sessionMaxAges(
      { accessExpiresAt: 'x', refreshExpiresAt: '2020-01-01T00:00:00Z' },
      now,
    );
    expect(ages).toEqual({ access: 900, refresh: 604_800 });
  });
});

describe('cookieOptions', () => {
  it('es httpOnly, lax y de path raíz', () => {
    expect(cookieOptions(10)).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 10,
    });
  });
});
