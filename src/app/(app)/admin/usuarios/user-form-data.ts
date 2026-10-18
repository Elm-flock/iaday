import type { components } from '@/lib/api/schema';

type CreateBody = components['schemas']['CreateUserDto'];
type UpdateBody = components['schemas']['UpdateUserDto'];

export type ParseResult<T> =
  { ok: true; body: T } | { ok: false; fieldErrors: Record<string, string> };

const ROLES = ['ADMIN', 'LEADER', 'MEMBER'] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

const text = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === 'string' ? v : '';
};

const isRole = (v: string): v is CreateBody['role'] => (ROLES as readonly string[]).includes(v);

function checkName(name: string, errors: Record<string, string>) {
  if (!name) errors.name = 'Ingresá el nombre completo.';
  else if (name.length > 120) errors.name = 'El nombre puede tener hasta 120 caracteres.';
}

function checkPassword(password: string, errors: Record<string, string>, field = 'password') {
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    errors[field] =
      `La contraseña tiene que tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres.`;
  }
}

export function parseCreateUser(formData: FormData): ParseResult<CreateBody> {
  const errors: Record<string, string> = {};
  const name = text(formData, 'name').trim();
  const email = text(formData, 'email').trim().toLowerCase();
  const role = text(formData, 'role');
  const password = text(formData, 'password');

  checkName(name, errors);
  if (!EMAIL.test(email) || email.length > 254)
    errors.email = 'Ingresá un email válido, por ejemplo nombre@flockit.com.ar.';
  if (!isRole(role)) errors.role = 'Elegí un rol.';
  // Opcional: en blanco, el back genera una clave inicial y la devuelve una sola vez.
  if (password) checkPassword(password, errors);

  if (Object.keys(errors).length > 0 || !isRole(role)) return { ok: false, fieldErrors: errors };
  return { ok: true, body: password ? { name, email, role, password } : { name, email, role } };
}

/** `self`: la persona edita su propia cuenta → no se envían rol ni estado (el back lo rechaza). */
export function parseUpdateUser(
  formData: FormData,
  { self }: { self: boolean },
): ParseResult<UpdateBody> {
  const errors: Record<string, string> = {};
  const name = text(formData, 'name').trim();
  checkName(name, errors);

  const role = text(formData, 'role');
  if (!self && !isRole(role)) errors.role = 'Elegí un rol.';
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };

  if (self) return { ok: true, body: { name } };
  return {
    ok: true,
    body: { name, role: role as CreateBody['role'], active: formData.get('active') === 'on' },
  };
}

export function parsePassword(formData: FormData): ParseResult<{ password: string }> {
  const errors: Record<string, string> = {};
  const password = text(formData, 'password');
  checkPassword(password, errors);
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return { ok: true, body: { password } };
}
