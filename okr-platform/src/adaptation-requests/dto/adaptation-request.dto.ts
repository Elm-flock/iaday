import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Espejan los enums de Prisma (AdaptationFormat / AdaptationRequestStatus). */
export const ADAPTATION_FORMATS = [
  'LECTURA_FACIL',
  'LENGUAJE_CLARO',
  'AUDIO',
  'APOYO_VISUAL',
  'REUNION_ADAPTADA',
  'OTRO',
] as const;
export type AdaptationFormatName = (typeof ADAPTATION_FORMATS)[number];

export const ADAPTATION_REQUEST_STATUSES = [
  'PENDIENTE',
  'EN_CURSO',
  'ENTREGADA',
  'RECHAZADA',
] as const;
export type AdaptationRequestStatusName = (typeof ADAPTATION_REQUEST_STATUSES)[number];

/** Elementos a los que se puede vincular un pedido. */
export const LINKABLE_ENTITY_TYPES = ['OBJECTIVE', 'CHECK_IN', 'FEEDBACK'] as const;
export type LinkableEntityType = (typeof LINKABLE_ENTITY_TYPES)[number];

export const SUBJECT_MAX = 150;
export const DESCRIPTION_MAX = 2000;
export const TEXT_MAX = 2000;

export class CreateAdaptationRequestDto {
  @ApiProperty({
    maxLength: SUBJECT_MAX,
    description: 'Qué documento necesitás, en pocas palabras',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(SUBJECT_MAX)
  subject!: string;

  @ApiPropertyOptional({
    maxLength: DESCRIPTION_MAX,
    description: 'Detalle de lo que necesitás (opcional)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX)
  description?: string;

  @ApiProperty({ enum: ADAPTATION_FORMATS })
  @IsIn(ADAPTATION_FORMATS)
  preferredFormat!: AdaptationFormatName;

  @ApiPropertyOptional({
    enum: LINKABLE_ENTITY_TYPES,
    description: 'Elemento al que se refiere el pedido. Va junto con entityId.',
  })
  @IsOptional()
  @IsIn(LINKABLE_ENTITY_TYPES)
  entityType?: LinkableEntityType;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Id del objetivo, check-in o feedback. Un feedback solo se puede vincular si sos quien lo envió o lo recibió.',
  })
  @IsOptional()
  @IsUUID()
  entityId?: string;
}

export class AssignAdaptationRequestDto {
  @ApiProperty({ format: 'uuid', description: 'Persona de administración que se hace cargo' })
  @IsUUID()
  assigneeId!: string;
}

export class DeliverAdaptationRequestDto {
  @ApiPropertyOptional({
    maxLength: TEXT_MAX,
    description: 'Qué se entrega y cómo acceder (mínimo 10 caracteres; lo valida el dominio)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(TEXT_MAX)
  resolutionNote?: string;

  @ApiPropertyOptional({ maxLength: 500, description: 'Enlace al documento adaptado (http/https)' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  resolutionLink?: string;
}

export class RejectAdaptationRequestDto {
  @ApiPropertyOptional({
    maxLength: TEXT_MAX,
    description:
      'Justificación por escrito, en lenguaje claro (art. 14.5: solo por carga desproporcionada). Mínimo 20 caracteres; sin ella responde 422.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(TEXT_MAX)
  justification?: string;
}

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' || value === true ? true : value === 'false' || value === false ? false : value;

export class ListAdaptationRequestsQueryDto {
  @ApiPropertyOptional({ enum: ADAPTATION_REQUEST_STATUSES })
  @IsOptional()
  @IsIn(ADAPTATION_REQUEST_STATUSES)
  status?: AdaptationRequestStatusName;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'true: solo los vencidos (abiertos y pasados de fecha). false: el resto.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  overdue?: boolean;

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

export class MyAdaptationRequestsQueryDto {
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

export class AdaptationRequestDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) requesterId!: string | null;
  @ApiProperty({ type: String, nullable: true }) requesterName!: string | null;
  @ApiProperty() subject!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ enum: LINKABLE_ENTITY_TYPES, nullable: true })
  entityType!: LinkableEntityType | null;
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Para un feedback vinculado, solo lo ve quien hizo el pedido (administración no recibe el id).',
  })
  entityId!: string | null;
  @ApiProperty({ enum: ADAPTATION_FORMATS }) preferredFormat!: AdaptationFormatName;
  @ApiProperty({ enum: ADAPTATION_REQUEST_STATUSES }) status!: AdaptationRequestStatusName;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) assigneeId!: string | null;
  @ApiProperty({ type: String, nullable: true }) assigneeName!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) dueDate!: Date;
  @ApiProperty({ description: 'Abierto y pasado de la fecha límite' }) overdue!: boolean;
  @ApiProperty({ type: String, nullable: true }) resolutionNote!: string | null;
  @ApiProperty({ type: String, nullable: true }) resolutionLink!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Obligatoria cuando el estado es RECHAZADA; la ve quien hizo el pedido',
  })
  rejectionJustification!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) resolvedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}

export class AdaptationRequestPageDto {
  @ApiProperty({ type: [AdaptationRequestDto] }) items!: AdaptationRequestDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
