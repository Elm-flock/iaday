import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/**
 * Exige que, entre `properties`, exactamente una tenga valor (null/undefined = ausente).
 * Se aplica a UNA de las propiedades y SIN `@IsOptional()` en ella (IsOptional saltearía
 * la validación justo cuando falta el valor, que es el caso a detectar).
 */
export function ExactlyOneOf(properties: string[], options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'exactlyOneOf',
      target: target.constructor,
      propertyName: propertyKey as string,
      options,
      constraints: properties,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const object = args.object as Record<string, unknown>;
          const present = (args.constraints as string[]).filter(
            (p) => object[p] !== undefined && object[p] !== null,
          );
          return present.length === 1;
        },
        defaultMessage(args: ValidationArguments): string {
          return `Debe indicarse exactamente uno de: ${(args.constraints as string[]).join(', ')}`;
        },
      },
    });
  };
}
