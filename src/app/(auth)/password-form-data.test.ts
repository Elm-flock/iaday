import { describe, expect, it } from 'vitest';
import { parseChangePassword } from './password-form-data';

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

describe('parseChangePassword', () => {
  const ok = {
    currentPassword: 'inicial',
    newPassword: 'x'.repeat(12),
    confirmPassword: 'x'.repeat(12),
  };

  it('acepta 12+ caracteres iguales en ambos campos y arma el body del back', () => {
    expect(parseChangePassword(form(ok))).toEqual({
      ok: true,
      body: { currentPassword: 'inicial', newPassword: 'x'.repeat(12) },
    });
  });

  it('exige la actual', () => {
    const r = parseChangePassword(form({ ...ok, currentPassword: '' }));
    expect(!r.ok && r.fieldErrors.currentPassword).toMatch(/actual/);
  });

  it('rechaza menos de 12 y más de 200', () => {
    const short = parseChangePassword(
      form({ ...ok, newPassword: 'x'.repeat(11), confirmPassword: 'x'.repeat(11) }),
    );
    expect(!short.ok && short.fieldErrors.newPassword).toMatch(/entre 12 y 200/);
    const long = parseChangePassword(
      form({ ...ok, newPassword: 'x'.repeat(201), confirmPassword: 'x'.repeat(201) }),
    );
    expect(long.ok).toBe(false);
  });

  it('rechaza una nueva igual a la actual', () => {
    const same = 'y'.repeat(14);
    const r = parseChangePassword(
      form({ currentPassword: same, newPassword: same, confirmPassword: same }),
    );
    expect(!r.ok && r.fieldErrors.newPassword).toMatch(/distinta/);
  });

  it('rechaza si la confirmación no coincide', () => {
    const r = parseChangePassword(form({ ...ok, confirmPassword: 'otra-cosa-larga' }));
    expect(!r.ok && r.fieldErrors.confirmPassword).toMatch(/no coinciden/);
  });
});
