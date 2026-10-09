/** Resultado de una regla de dominio pura: éxito con valor o fallo con código. */
export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; code: string; message: string };
export type Result<T = void> = Ok<T> | Err;

export function ok(): Ok<void>;
export function ok<T>(value: T): Ok<T>;
export function ok<T>(value?: T): Ok<T | undefined> {
  return { ok: true, value };
}

export function err(code: string, message: string): Err {
  return { ok: false, code, message };
}
