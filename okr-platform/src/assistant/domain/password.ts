import { randomBytes } from 'node:crypto';

export const INITIAL_PASSWORD_LENGTH = 20;

/**
 * Clave inicial aleatoria: 20 caracteres base64url (15 bytes = 120 bits de entropía).
 * La fuente de bytes se inyecta para poder testearla; por defecto es `crypto.randomBytes`.
 */
export function generateInitialPassword(source: (size: number) => Buffer = randomBytes): string {
  return source(15).toString('base64url').slice(0, INITIAL_PASSWORD_LENGTH);
}
