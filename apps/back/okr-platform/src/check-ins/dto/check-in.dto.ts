import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const CHECK_IN_ACTIONS = ['CONTINUE', 'UPDATE', 'START', 'STOP'] as const;
export const SCORE_BANDS = ['RED', 'YELLOW', 'GREEN'] as const;
export const CHECK_IN_CADENCES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const;

/** Decimal(18,4) como string: hasta 14 dígitos enteros y 4 decimales, con signo opcional. */
const DECIMAL = /^-?\d{1,14}(\.\d{1,4})?$/;

export class CreateCheckInDto {
  @ApiPropertyOptional({
    example: '50',
    description: 'Nuevo valor actual (decimal como string). Obligatorio en KR numérico (DERIVED).',
  })
  @IsOptional()
  @Matches(DECIMAL, {
    message: '$property debe ser un decimal (hasta 14 enteros y 4 decimales) en string',
  })
  value?: string;

  @ApiPropertyOptional({
    example: 0.7,
    description: 'Score 0..1 en pasos de 0.1. Obligatorio en KR binario (MANUAL).',
  })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1)
  manualScore?: number;

  @ApiProperty({ enum: CHECK_IN_ACTIONS, description: 'Exactamente una acción' })
  @IsIn(CHECK_IN_ACTIONS)
  action!: (typeof CHECK_IN_ACTIONS)[number];

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class CheckInDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) keyResultId!: string;
  @ApiProperty({ format: 'uuid' }) authorId!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Decimal como string (snapshot)' })
  value!: string | null;
  @ApiProperty({ description: 'Score 0..1 al momento del check-in (snapshot inmutable)' })
  score!: number;
  @ApiProperty({ enum: SCORE_BANDS, description: 'Banda al momento del check-in (snapshot)' })
  band!: (typeof SCORE_BANDS)[number];
  @ApiProperty({ enum: CHECK_IN_ACTIONS }) action!: (typeof CHECK_IN_ACTIONS)[number];
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}

export class PendingCheckInDto {
  @ApiProperty({ format: 'uuid' }) keyResultId!: string;
  @ApiProperty() keyResultTitle!: string;
  @ApiProperty({ format: 'uuid' }) objectiveId!: string;
  @ApiProperty() objectiveTitle!: string;
  @ApiProperty({ enum: CHECK_IN_CADENCES, description: 'Cadencia del ciclo' })
  cadence!: (typeof CHECK_IN_CADENCES)[number];
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastCheckInAt!: Date | null;
  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Referencia del vencimiento: último check-in o, si no hay, la publicación',
  })
  referenceAt!: Date;
}
