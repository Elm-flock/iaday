import type { components } from '@/lib/api/schema';

type Body = components['schemas']['ChangePasswordDto'];

/** Mismo mínimo que el back (`POST /auth/change-password`). */
export const NEW_PASSWORD_MIN = 12;
export const NEW_PASSWORD_MAX = 200;

export type ParseResult =
  { ok: true; body: Body } | { ok: false; fieldErrors: Record<string, string> };

const text = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === 'string' ? v : '';
};

/** Validación previa al back: ahorra un viaje y da el error junto al campo. */
export function parseChangePassword(formData: FormData): ParseResult {
  const errors: Record<string, string> = {};
  const currentPassword = text(formData, 'currentPassword');
  const newPassword = text(formData, 'newPassword');
  const confirm = text(formData, 'confirmPassword');

  if (!currentPassword) errors.currentPassword = 'Ingresá tu contraseña actual.';
  if (newPassword.length < NEW_PASSWORD_MIN || newPassword.length > NEW_PASSWORD_MAX) {
    errors.newPassword = `La contraseña nueva tiene que tener entre ${NEW_PASSWORD_MIN} y ${NEW_PASSWORD_MAX} caracteres.`;
  } else if (newPassword === currentPassword) {
    errors.newPassword = 'La contraseña nueva tiene que ser distinta de la actual.';
  }
  if (!errors.newPassword && confirm !== newPassword) {
    errors.confirmPassword = 'Las dos contraseñas nuevas no coinciden.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return { ok: true, body: { currentPassword, newPassword } };
}
