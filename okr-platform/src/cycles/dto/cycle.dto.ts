import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const CYCLE_KINDS = ['ANNUAL', 'QUARTER'] as const;
export const CYCLE_STATUSES = ['DRAFT', 'ACTIVE', 'CLOSED'] as const;
export const CHECK_IN_CADENCES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const THRESHOLD_OPTS = { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false };

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CycleDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: CYCLE_KINDS }) kind!: (typeof CYCLE_KINDS)[number];
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) parentId!: string | null;
  @ApiProperty({ example: '2026-01-01', description: 'Fecha (YYYY-MM-DD)' }) startDate!: string;
  @ApiProperty({ example: '2026-12-31', description: 'Fecha (YYYY-MM-DD)' }) endDate!: string;
  @ApiProperty({ enum: CYCLE_STATUSES }) status!: (typeof CYCLE_STATUSES)[number];
  @ApiProperty({ enum: CHECK_IN_CADENCES }) checkInCadence!: (typeof CHECK_IN_CADENCES)[number];
  @ApiProperty({ description: 'Umbral de logro de objetivos COMMITTED, en (0, 1]' })
  committedThreshold!: number;
  @ApiProperty({ description: 'Umbral de logro de objetivos ASPIRATIONAL, en (0, 1]' })
  aspirationalThreshold!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) closedAt!: Date | null;
}

export class CycleCloseDto extends CycleDto {
  @ApiProperty({ description: 'Objetivos PUBLISHED que se cerraron con finalScore/achieved' })
  closedObjectives!: number;
  @ApiProperty({ description: 'De los cerrados, cuántos alcanzaron el umbral del ciclo' })
  achievedObjectives!: number;
}

export class CreateCycleDto {
  @ApiProperty({ example: 'OKR 2026' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: CYCLE_KINDS })
  @IsIn(CYCLE_KINDS)
  kind!: (typeof CYCLE_KINDS)[number];

  @ApiPropertyOptional({ format: 'uuid', description: 'ANNUAL padre (solo para QUARTER)' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiProperty({ example: '2026-01-01' })
  @Matches(DATE_ONLY)
  @IsISO8601({ strict: true })
  startDate!: string;

  @ApiProperty({ example: '2026-12-31' })
  @Matches(DATE_ONLY)
  @IsISO8601({ strict: true })
  endDate!: string;

  @ApiPropertyOptional({ enum: CHECK_IN_CADENCES, default: 'WEEKLY' })
  @IsOptional()
  @IsIn(CHECK_IN_CADENCES)
  checkInCadence?: (typeof CHECK_IN_CADENCES)[number];

  @ApiPropertyOptional({ minimum: 0.01, maximum: 1, default: 1 })
  @IsOptional()
  @IsNumber(THRESHOLD_OPTS)
  @Min(0.01)
  @Max(1)
  committedThreshold?: number;

  @ApiPropertyOptional({ minimum: 0.01, maximum: 1, default: 0.7 })
  @IsOptional()
  @IsNumber(THRESHOLD_OPTS)
  @Min(0.01)
  @Max(1)
  aspirationalThreshold?: number;
}

export class UpdateCycleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Solo en ciclos DRAFT' })
  @IsOptional()
  @Matches(DATE_ONLY)
  @IsISO8601({ strict: true })
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Solo en ciclos DRAFT' })
  @IsOptional()
  @Matches(DATE_ONLY)
  @IsISO8601({ strict: true })
  endDate?: string;

  @ApiPropertyOptional({ enum: CHECK_IN_CADENCES })
  @IsOptional()
  @IsIn(CHECK_IN_CADENCES)
  checkInCadence?: (typeof CHECK_IN_CADENCES)[number];

  @ApiPropertyOptional({ minimum: 0.01, maximum: 1 })
  @IsOptional()
  @IsNumber(THRESHOLD_OPTS)
  @Min(0.01)
  @Max(1)
  committedThreshold?: number;

  @ApiPropertyOptional({ minimum: 0.01, maximum: 1 })
  @IsOptional()
  @IsNumber(THRESHOLD_OPTS)
  @Min(0.01)
  @Max(1)
  aspirationalThreshold?: number;
}
