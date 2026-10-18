import { describe, expect, it } from 'vitest';
import { parseCreateUser, parsePassword, parseUpdateUser } from './user-form-data';

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

describe('parseCreateUser', () => {
  it('normaliza el email a minúsculas', () => {
    const result = parseCreateUser(
      form({ name: ' Ana ', email: ' ANA@Flockit.com.ar ', role: 'MEMBER', password: '12345678' }),
    );
    expect(result).toEqual({
      ok: true,
      body: { name: 'Ana', email: 'ana@flockit.com.ar', role: 'MEMBER', password: '12345678' },
    });
  });

  it('marca email, rol y contraseña inválidos', () => {
    const result = parseCreateUser(form({ name: 'Ana', email: 'ana', role: 'X', password: '123' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.fieldErrors).sort()).toEqual(['email', 'password', 'role']);
      expect(result.fieldErrors.password).toMatch(/entre 8 y 200/);
    }
  });
});

describe('parseCreateUser: contraseña opcional', () => {
  it('sin contraseña no la envía: el back genera una y la devuelve una sola vez', () => {
    const result = parseCreateUser(
      form({ name: 'Ana', email: 'ana@x.com', role: 'MEMBER', password: '' }),
    );
    expect(result).toEqual({ ok: true, body: { name: 'Ana', email: 'ana@x.com', role: 'MEMBER' } });
    expect(result.ok && 'password' in result.body).toBe(false);
  });

  it('si la define, sigue validando el largo', () => {
    const result = parseCreateUser(
      form({ name: 'Ana', email: 'ana@x.com', role: 'MEMBER', password: 'corta' }),
    );
    expect(result.ok).toBe(false);
  });
});

describe('parseUpdateUser', () => {
  it('editando a otra persona envía rol y estado', () => {
    const on = parseUpdateUser(form({ name: 'Ana', role: 'LEADER', active: 'on' }), {
      self: false,
    });
    expect(on.ok && on.body).toEqual({ name: 'Ana', role: 'LEADER', active: true });
    const off = parseUpdateUser(form({ name: 'Ana', role: 'LEADER' }), { self: false });
    expect(off.ok && off.body.active).toBe(false);
  });

  it('editándose a sí misma solo envía el nombre (el back rechaza cambiar rol o estado propios)', () => {
    const result = parseUpdateUser(form({ name: 'Ana' }), { self: true });
    expect(result).toEqual({ ok: true, body: { name: 'Ana' } });
  });
});

describe('parsePassword', () => {
  it('exige entre 8 y 200 caracteres', () => {
    expect(parsePassword(form({ password: 'corta' })).ok).toBe(false);
    expect(parsePassword(form({ password: 'x'.repeat(201) })).ok).toBe(false);
    expect(parsePassword(form({ password: 'suficiente1' })).ok).toBe(true);
  });
});
