import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const USER_ROLES = ['ADMIN', 'LEADER', 'MEMBER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: USER_ROLES }) role!: UserRole;
  @ApiProperty() active!: boolean;
}

export class CreatedUserDto extends UserDto {
  @ApiProperty({
    description:
      'Siempre true en un alta: la persona debe cambiar la clave inicial al entrar (el login y /auth/me lo informan)',
  })
  mustChangePassword!: boolean;

  @ApiPropertyOptional({
    description:
      'Clave inicial generada. Se muestra UNA sola vez, solo si el pedido no trajo `password`; nunca se guarda en claro ni se audita.',
  })
  initialPassword?: string;
}

export class CreateUserDto {
  @ApiProperty({ example: 'ana@empresa.com', description: 'Se guarda en minúsculas' })
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Ana Pérez' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    minLength: 8,
    maxLength: 200,
    description:
      'Clave inicial (se guarda con argon2id). Opcional: si se omite, el back genera una aleatoria y la devuelve una sola vez en `initialPassword`. En ambos casos la persona debe cambiarla al entrar.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password?: string;

  @ApiPropertyOptional({ enum: USER_ROLES, default: 'MEMBER' })
  @IsOptional()
  @IsIn(USER_ROLES)
  role?: UserRole;
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: USER_ROLES })
  @IsOptional()
  @IsIn(USER_ROLES)
  role?: UserRole;

  @ApiPropertyOptional({ description: 'false desactiva al usuario y revoca sus sesiones' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ResetPasswordDto {
  @ApiProperty({ minLength: 8, maxLength: 200 })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}
