import { isUUID, ValidateBy, type ValidationOptions } from 'class-validator';

/**
 * UUID solo si hay valor (null/undefined pasan). A diferencia de `@IsOptional()`, no desactiva
 * el resto de validadores de la propiedad (necesario junto a `@ExactlyOneOf`).
 */
export function IsUuidIfPresent(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isUuidIfPresent',
      validator: {
        validate: (value: unknown): boolean =>
          value === undefined || value === null || (typeof value === 'string' && isUUID(value)),
        defaultMessage: (): string => '$property debe ser un UUID',
      },
    },
    options,
  );
}
