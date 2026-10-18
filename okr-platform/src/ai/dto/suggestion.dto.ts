import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Igual que la API de KRs: decimal como string. */
const DECIMAL = /^-?\d{1,14}(\.\d{1,4})?$/;

export const AI_FEATURES = ['ADAPT', 'OKR_SUGGEST', 'CHECKIN_SUMMARY'] as const;
export const SUMMARY_LEVELS = ['STANDARD', 'PLAIN'] as const;

export class DraftKeyResultDto {
  @ApiProperty({ maxLength: 300 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  unit?: string;

  @ApiPropertyOptional({ example: '0', description: 'Decimal como string' })
  @IsOptional()
  @Matches(DECIMAL, { message: '$property debe ser un decimal en string' })
  startValue?: string;

  @ApiPropertyOptional({ example: '100', description: 'Decimal como string' })
  @IsOptional()
  @Matches(DECIMAL, { message: '$property debe ser un decimal en string' })
  targetValue?: string;
}

export class DraftObjectiveDto {
  @ApiProperty({ maxLength: 300, description: 'Puede ser un borrador pobre' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: ['COMMITTED', 'ASPIRATIONAL'] })
  @IsIn(['COMMITTED', 'ASPIRATIONAL'])
  type!: 'COMMITTED' | 'ASPIRATIONAL';

  @ApiPropertyOptional({ type: [DraftKeyResultDto], description: 'Hasta 5 KRs' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => DraftKeyResultDto)
  keyResults?: DraftKeyResultDto[];
}

export class OkrSuggestDto {
  @ApiProperty({ format: 'uuid', description: 'Ciclo del objetivo (define el horizonte)' })
  @IsUUID()
  cycleId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Objetivo existente a mejorar (exige poder editarlo). Sin esto, informar el owner.',
  })
  @IsOptional()
  @IsUUID()
  objectiveId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Owner usuario del objetivo nuevo' })
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Owner equipo del objetivo nuevo' })
  @IsOptional()
  @IsUUID()
  ownerTeamId?: string;

  @ApiProperty({ type: DraftObjectiveDto })
  @ValidateNested()
  @Type(() => DraftObjectiveDto)
  draft!: DraftObjectiveDto;
}

export class SummaryQueryDto {
  @ApiPropertyOptional({ enum: SUMMARY_LEVELS, default: 'STANDARD' })
  @IsOptional()
  @IsIn(SUMMARY_LEVELS)
  level?: (typeof SUMMARY_LEVELS)[number];
}

export class AiSuggestionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: AI_FEATURES }) feature!: (typeof AI_FEATURES)[number];
  @ApiProperty({ format: 'uuid' }) traceId!: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Resultado del agente tal cual: OKR_SUGGEST { objective, keyResults, warnings }; CHECKIN_SUMMARY { summary, trend, highlights, risks }',
  })
  payload!: Record<string, unknown>;
  @ApiProperty({ description: 'true: requiere revisión humana antes de usarla' })
  needsHumanReview!: boolean;
  @ApiProperty({ type: String, nullable: true }) reviewReason!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) acceptedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) discardedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}
