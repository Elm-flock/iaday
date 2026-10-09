import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateRecognitionDto {
  @ApiProperty({ format: 'uuid', description: 'Persona reconocida (no puede ser uno mismo)' })
  @IsUUID()
  toUserId!: string;

  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Objetivo hito (CLOSED) al que se vincula el reconocimiento',
  })
  @IsOptional()
  @IsUUID()
  objectiveId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'KR hito (score >= 0.7, o de un objetivo CLOSED) al que se vincula',
  })
  @IsOptional()
  @IsUUID()
  keyResultId?: string;
}

export class ListRecognitionsQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Solo los dirigidos a esta persona' })
  @IsOptional()
  @IsUUID()
  toUserId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export class RecognitionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) fromUserId!: string;
  @ApiProperty({ format: 'uuid' }) toUserId!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) objectiveId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) keyResultId!: string | null;
  @ApiProperty({ description: 'true si el enlace a un hito fue validado al crearlo' })
  milestoneVerified!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}

/** Muro público paginado. Sin conteos ni agregados por persona (no hay ranking). */
export class RecognitionPageDto {
  @ApiProperty({ type: [RecognitionDto] }) items!: RecognitionDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
