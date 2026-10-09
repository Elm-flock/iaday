import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { KR_SCORINGS } from './key-result.dto';

/** Decimal(18,4) como string: hasta 14 dígitos enteros y 4 decimales, con signo opcional. */
const DECIMAL = /^-?\d{1,14}(\.\d{1,4})?$/;
const DECIMAL_MESSAGE = '$property debe ser un decimal (hasta 14 enteros y 4 decimales) en string';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateKeyResultDto {
  @ApiProperty({ example: 'Llegar a 100 clientes' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ format: 'uuid', description: 'Responsable del KR' })
  @IsUUID()
  ownerId!: string;

  @ApiProperty({
    enum: KR_SCORINGS,
    description: 'DERIVED = numérico (requiere start y target); MANUAL = binario (sin valores)',
  })
  @IsIn(KR_SCORINGS)
  scoring!: (typeof KR_SCORINGS)[number];

  @ApiPropertyOptional({ example: 'clientes' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  unit?: string;

  @ApiPropertyOptional({ example: '0', description: 'Decimal como string. Solo DERIVED.' })
  @IsOptional()
  @Matches(DECIMAL, { message: DECIMAL_MESSAGE })
  startValue?: string;

  @ApiPropertyOptional({
    example: '100',
    description: 'Decimal como string. Solo DERIVED; puede ser menor que startValue.',
  })
  @IsOptional()
  @Matches(DECIMAL, { message: DECIMAL_MESSAGE })
  targetValue?: string;
}

export class UpdateKeyResultDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  unit?: string | null;

  @ApiPropertyOptional({
    description:
      'Decimal como string. Tras publicar solo ADMIN o líder (con auditoría KR_TARGET_CHANGED).',
  })
  @IsOptional()
  @Matches(DECIMAL, { message: DECIMAL_MESSAGE })
  startValue?: string;

  @ApiPropertyOptional({
    description:
      'Decimal como string. Tras publicar solo ADMIN o líder (con auditoría KR_TARGET_CHANGED).',
  })
  @IsOptional()
  @Matches(DECIMAL, { message: DECIMAL_MESSAGE })
  targetValue?: string;
}
