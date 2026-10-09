import { err, ok, type Result } from '../../common/domain/result';

export interface KrDefinition {
  scoring: 'DERIVED' | 'MANUAL';
  /** Decimal como string (p. ej. "100", "-3.5") o null/undefined si no se indicó. */
  start?: string | null;
  target?: string | null;
}

const SCALE = 4;

/** Decimal(18,4) -> entero escalado, para comparar sin errores de coma flotante. */
function toScaled(value: string): bigint {
  const negative = value.trim().startsWith('-');
  const [int, frac = ''] = value.trim().replace(/^[+-]/, '').split('.');
  const scaled =
    BigInt(int || '0') * 10n ** BigInt(SCALE) + BigInt(frac.padEnd(SCALE, '0').slice(0, SCALE));
  return negative ? -scaled : scaled;
}

/** Igualdad numérica de decimales en string ("100" == "100.0000"). */
export function decimalEquals(a: string, b: string): boolean {
  return toScaled(a) === toScaled(b);
}

const present = (v: string | null | undefined): v is string => v !== undefined && v !== null;

/**
 * DERIVED (numérico): exige start y target distintos (target < start es válido: métricas a la baja).
 * MANUAL (binario): no lleva start/target.
 */
export function validateKrDefinition(kr: KrDefinition): Result<void> {
  if (kr.scoring === 'MANUAL') {
    return present(kr.start) || present(kr.target)
      ? err('KR_VALUES_NOT_ALLOWED', 'Un KR binario (MANUAL) no lleva valor inicial ni meta')
      : ok();
  }
  if (!present(kr.start) || !present(kr.target))
    return err('KR_VALUES_REQUIRED', 'Un KR numérico requiere valor inicial y meta');
  if (decimalEquals(kr.start, kr.target))
    return err('INVALID_KR_RANGE', 'El valor inicial y la meta no pueden ser iguales');
  return ok();
}
