import { err, ok, type Result } from '../../common/domain/result';

/** Mismo mínimo que exige el seed del admin inicial (SEED_ADMIN_PASSWORD >= 12). */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;

/** Reglas puras del cambio de clave: la nueva debe cumplir el mínimo y ser distinta de la actual. */
export function validatePasswordChange(current: string, next: string): Result {
  if (next.length < MIN_PASSWORD_LENGTH) {
    return err(
      'PASSWORD_TOO_SHORT',
      `La contraseña nueva tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    );
  }
  if (next.trim().length === 0) {
    return err('PASSWORD_TOO_SHORT', 'La contraseña nueva no puede estar en blanco.');
  }
  if (next === current) {
    return err('PASSWORD_UNCHANGED', 'La contraseña nueva tiene que ser distinta de la actual.');
  }
  return ok();
}
