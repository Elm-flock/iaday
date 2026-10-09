import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ExactlyOneOf } from '../../common/validators/exactly-one-of';
import { IsUuidIfPresent } from '../../common/validators/uuid-if-present';
import { KeyResultDto } from './key-result.dto';

export const OBJECTIVE_ORIGINS = ['TOP_DOWN', 'BOTTOM_UP'] as const;
export const OBJECTIVE_TYPES = ['COMMITTED', 'ASPIRATIONAL'] as const;
export const OBJECTIVE_STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED'] as const;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ObjectiveDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) cycleId!: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) ownerUserId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) ownerTeamId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  parentObjectiveId!: string | null;
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ enum: OBJECTIVE_ORIGINS }) origin!: (typeof OBJECTIVE_ORIGINS)[number];
  @ApiProperty({ enum: OBJECTIVE_TYPES }) type!: (typeof OBJECTIVE_TYPES)[number];
  @ApiProperty({ enum: OBJECTIVE_STATUSES }) status!: (typeof OBJECTIVE_STATUSES)[number];
  @ApiProperty({ description: 'Promedio de los KRs, 0..1 (4 decimales)' }) score!: number;
  @ApiProperty({ type: Number, nullable: true, description: 'Score al cierre del ciclo' })
  finalScore!: number | null;
  @ApiProperty({ type: Boolean, nullable: true, description: 'Logrado según el umbral del ciclo' })
  achieved!: boolean | null;
  @ApiProperty({ format: 'uuid' }) createdById!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) publishedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) closedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ description: 'true si alguno de sus KRs tiene al menos un check-in' })
  hasCheckIns!: boolean;
  @ApiProperty({ type: [KeyResultDto] }) keyResults!: KeyResultDto[];
}

export class CreateObjectiveDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  cycleId!: string;

  @ApiProperty({ example: 'Reducir el tiempo de entrega' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: OBJECTIVE_ORIGINS, description: 'Obligatorio' })
  @IsIn(OBJECTIVE_ORIGINS)
  origin!: (typeof OBJECTIVE_ORIGINS)[number];

  @ApiProperty({ enum: OBJECTIVE_TYPES })
  @IsIn(OBJECTIVE_TYPES)
  type!: (typeof OBJECTIVE_TYPES)[number];

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Owner usuario. Exactamente uno entre ownerUserId y ownerTeamId.',
  })
  @ExactlyOneOf(['ownerUserId', 'ownerTeamId'])
  @IsUuidIfPresent()
  ownerUserId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Owner equipo' })
  @IsUuidIfPresent()
  ownerTeamId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Objetivo PUBLISHED al que se alinea (puede ser de otro ciclo)',
  })
  @IsOptional()
  @IsUUID()
  parentObjectiveId?: string;
}

export class UpdateObjectiveDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: OBJECTIVE_ORIGINS, description: 'Solo en DRAFT' })
  @IsOptional()
  @IsIn(OBJECTIVE_ORIGINS)
  origin?: (typeof OBJECTIVE_ORIGINS)[number];

  @ApiPropertyOptional({ enum: OBJECTIVE_TYPES, description: 'Solo en DRAFT' })
  @IsOptional()
  @IsIn(OBJECTIVE_TYPES)
  type?: (typeof OBJECTIVE_TYPES)[number];

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'Objetivo PUBLISHED al que se alinea; null para desalinear',
  })
  @IsOptional()
  @IsUUID()
  parentObjectiveId?: string | null;
}

export class ListObjectivesQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() cycleId?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Objetivos cuyo owner es este equipo' })
  @IsOptional()
  @IsUUID()
  teamId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() ownerUserId?: string;
  @ApiPropertyOptional({ enum: OBJECTIVE_STATUSES })
  @IsOptional()
  @IsIn(OBJECTIVE_STATUSES)
  status?: (typeof OBJECTIVE_STATUSES)[number];
}
