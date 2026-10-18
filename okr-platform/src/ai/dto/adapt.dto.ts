import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const ADAPTATION_LEVELS = ['EASY_READ', 'PLAIN'] as const;
export const ADAPTATION_STATUSES = ['DRAFT', 'ACCEPTED', 'VALIDATED', 'NEEDS_REVIEW'] as const;
export const AI_ENTITY_TYPES = ['OBJECTIVE', 'KEY_RESULT', 'CHECK_IN', 'FEEDBACK'] as const;

/** Tipos de la ruta: /ai/adapt/{objective|check-in|feedback}/:id */
export const ADAPT_ROUTE_TYPES = ['objective', 'check-in', 'feedback'] as const;

export class AdaptQueryDto {
  @ApiProperty({
    enum: ADAPTATION_LEVELS,
    description: 'EASY_READ = lectura fácil (UNE 153101); PLAIN = lenguaje claro (UNE-ISO 24495-1)',
  })
  @IsIn(ADAPTATION_LEVELS)
  level!: (typeof ADAPTATION_LEVELS)[number];
}

export class SegmentDto {
  @ApiProperty({ example: 'checkin.note' }) key!: string;
  @ApiProperty() text!: string;
}

export class GlossaryEntryDto {
  @ApiProperty() term!: string;
  @ApiProperty() explanation!: string;
}

export class AdaptedContentBodyDto {
  @ApiProperty({ type: [SegmentDto] }) segments!: SegmentDto[];
  @ApiProperty({ type: [GlossaryEntryDto] }) glossary!: GlossaryEntryDto[];
}

export class AdaptedContentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: AI_ENTITY_TYPES }) entityType!: (typeof AI_ENTITY_TYPES)[number];
  @ApiProperty({ format: 'uuid' }) entityId!: string;
  @ApiProperty({ enum: ADAPTATION_LEVELS }) level!: (typeof ADAPTATION_LEVELS)[number];
  @ApiProperty({
    enum: ADAPTATION_STATUSES,
    description:
      'DRAFT/ACCEPTED: generado por IA, pendiente de validación; VALIDATED: validado por una persona; NEEDS_REVIEW: requiere revisión humana (el contenido es el texto original sin adaptar)',
  })
  status!: (typeof ADAPTATION_STATUSES)[number];
  @ApiProperty({ type: String, nullable: true }) reviewReason!: string | null;
  @ApiProperty({ type: AdaptedContentBodyDto }) content!: AdaptedContentBodyDto;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Métricas de legibilidad { source, output } (Fernández-Huerta, Szigriszt-Pazos, INFLESZ)',
  })
  readability!: Record<string, unknown>;
  @ApiProperty({ description: 'true si vino de la caché (mismo texto de origen y nivel)' })
  cached!: boolean;
  @ApiProperty({ format: 'uuid' }) traceId!: string;
  @ApiProperty({ description: 'Latencia total del pedido en ms (RD 707/2026 art. 14.5)' })
  generationMs!: number;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) requestedById!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) acceptedAt!: Date | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) validatedById!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) validatedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) validationNote!: string | null;
  @ApiProperty() humanEdited!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}

export class EditedSegmentDto {
  @ApiProperty({ example: 'checkin.note' })
  @IsString()
  @MaxLength(64)
  key!: string;

  @ApiProperty({ minLength: 1, maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;
}

export class EditedGlossaryEntryDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) term!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(500) explanation!: string;
}

export class EditedContentDto {
  @ApiProperty({ type: [EditedSegmentDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => EditedSegmentDto)
  segments!: EditedSegmentDto[];

  @ApiPropertyOptional({ type: [EditedGlossaryEntryDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @ValidateNested({ each: true })
  @Type(() => EditedGlossaryEntryDto)
  glossary?: EditedGlossaryEntryDto[];
}

export class ValidateAdaptationDto {
  @ApiPropertyOptional({
    type: EditedContentDto,
    description:
      'Corrección humana: reemplaza la salida de la IA (mismas claves y orden de segmentos)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => EditedContentDto)
  content?: EditedContentDto;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class AiStatusDto {
  @ApiProperty({ description: 'false: la ayuda de IA está desactivada y la UI no debe ofrecerla' })
  enabled!: boolean;
}
