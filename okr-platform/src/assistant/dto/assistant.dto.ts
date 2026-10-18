import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const toBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' || value === true ? true : value === 'false' || value === false ? false : value;

export const PLAN_STATUS_VALUES = [
  'PROPOSED',
  'INVALID',
  'EXECUTING',
  'EXECUTED',
  'PARTIAL',
  'FAILED',
  'INTERRUPTED',
  'DISCARDED',
  'EXPIRED',
] as const;
export const MESSAGE_KIND_VALUES = [
  'TEXT',
  'PLAN',
  'QUERY_RESULT',
  'EXECUTION_RESULT',
  'HELP',
] as const;

// ---------------------------------------------------------------- requests

export class SendMessageDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 2000,
    example: 'Creá el equipo Datos dentro de Plataforma',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text!: string;
}

export class ConfirmPlanDto {
  @ApiProperty({
    description: 'planHash del plan que la persona vio (sha256 hex)',
    minLength: 64,
    maxLength: 64,
  })
  @IsString()
  @Length(64, 64)
  planHash!: string;
}

export class ListMessagesQueryDto {
  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 30;
}

export class DigestQueryDto {
  @ApiPropertyOptional({ description: 'true ignora la caché de 10 minutos ("Actualizar")' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  refresh?: boolean;
}

// --------------------------------------------------------------- responses

export class PlanActionDto {
  @ApiProperty() index!: number;
  @ApiProperty({ description: 'Tipo de la whitelist (CREATE_USER, ...)' }) type!: string;
  @ApiProperty({ description: 'Descripción legible en español, sin UUIDs' }) description!: string;
}

export class PlanIssueDto {
  @ApiProperty({ type: Number, nullable: true }) actionIndex!: number | null;
  @ApiProperty({ description: 'UNKNOWN_ACTION, UNGROUNDED, EMAIL_TAKEN, OBJECTIVE_LIMIT, ...' })
  code!: string;
  @ApiProperty() message!: string;
}

export class EntityLinkDto {
  @ApiProperty({ example: 'Team' }) type!: string;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Ruta de la app, si hay pantalla' })
  url!: string | null;
}

export class StepErrorDto {
  @ApiProperty() code!: string;
  @ApiProperty() message!: string;
}

export class StepResultDto {
  @ApiProperty() index!: number;
  @ApiProperty({ enum: ['OK', 'FAILED', 'SKIPPED'] }) status!: 'OK' | 'FAILED' | 'SKIPPED';
  @ApiProperty() description!: string;
  @ApiPropertyOptional({ type: EntityLinkDto }) entity?: EntityLinkDto;
  @ApiPropertyOptional({ type: StepErrorDto }) error?: StepErrorDto;
  @ApiPropertyOptional({
    description:
      'Clave inicial de un usuario recién creado. Solo viaja en la respuesta de confirmar: se muestra una sola vez y no se guarda.',
  })
  oneTimeSecret?: string;
}

export class PlanDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: PLAN_STATUS_VALUES }) status!: (typeof PLAN_STATUS_VALUES)[number];
  @ApiProperty() summary!: string;
  @ApiProperty({ type: [String] }) assumptions!: string[];
  @ApiProperty({ type: [PlanActionDto] }) actions!: PlanActionDto[];
  @ApiProperty({
    type: [PlanIssueDto],
    description: 'Bloqueantes: con issues no hay botón de confirmar',
  })
  issues!: PlanIssueDto[];
  @ApiProperty({ type: [PlanIssueDto], description: 'Avisos no bloqueantes (CREATES_ADMIN, ...)' })
  warnings!: PlanIssueDto[];
  @ApiProperty({ description: 'Se reenvía tal cual al confirmar' }) planHash!: string;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) confirmedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) finishedAt!: Date | null;
  @ApiPropertyOptional({
    type: [StepResultDto],
    description: 'Resultado por paso, si ya se ejecutó',
  })
  steps?: StepResultDto[];
}

export class QueryRowDto {
  @ApiProperty({ type: String, format: 'date-time' }) at!: Date;
  @ApiProperty({ type: String, nullable: true }) actorName!: string | null;
  @ApiProperty({ description: 'Valor de AuditAction' }) action!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty({ type: String, nullable: true }) entityLabel!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Ej.: "Integrante → Líder"' })
  change!: string | null;
}

export class RequestRowDto {
  @ApiProperty() subject!: string;
  @ApiProperty() preferredFormat!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, format: 'date-time' }) dueDate!: Date;
  @ApiProperty() overdue!: boolean;
  @ApiProperty({ type: String, nullable: true }) assigneeName!: string | null;
  @ApiProperty({ type: String, nullable: true }) requesterName!: string | null;
}

export class QueryResultDto {
  @ApiProperty({ enum: ['AUDIT_SEARCH', 'ADAPTATION_REQUESTS_LIST'] }) type!:
    'AUDIT_SEARCH' | 'ADAPTATION_REQUESTS_LIST';
  @ApiProperty() total!: number;
  @ApiProperty({ type: [QueryRowDto], description: 'Solo AUDIT_SEARCH' }) auditRows!: QueryRowDto[];
  @ApiProperty({ type: [RequestRowDto], description: 'Solo ADAPTATION_REQUESTS_LIST' })
  requestRows!: RequestRowDto[];
  @ApiProperty({
    description:
      'Pantalla con los mismos filtros (/admin/auditoria?... o /admin/pedidos-adaptacion?...)',
  })
  link!: string;
  @ApiProperty({ description: 'Texto determinista de resumen o de "sin resultados"' })
  summary!: string;
}

export class CitationDto {
  @ApiProperty({ example: 'admin#cómo-creo-un-usuario' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ example: '/ayuda/admin#cómo-creo-un-usuario' }) url!: string;
}

export class MessageDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['ADMIN', 'ASSISTANT'] }) role!: 'ADMIN' | 'ASSISTANT';
  @ApiProperty({ enum: MESSAGE_KIND_VALUES }) kind!: (typeof MESSAGE_KIND_VALUES)[number];
  @ApiProperty() text!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiPropertyOptional({ type: PlanDto, description: 'Kind PLAN: estado vigente del plan' })
  plan?: PlanDto;
  @ApiPropertyOptional({ type: QueryResultDto }) query?: QueryResultDto;
  @ApiPropertyOptional({ type: [CitationDto] }) citations?: CitationDto[];
  @ApiPropertyOptional({
    type: [StepResultDto],
    description: 'Kind EXECUTION_RESULT: pasos (sin claves)',
  })
  steps?: StepResultDto[];
}

export class TurnResultDto {
  @ApiProperty({
    type: [MessageDto],
    description: 'Los mensajes nuevos: el de la persona y la respuesta',
  })
  messages!: MessageDto[];
  @ApiPropertyOptional({ type: PlanDto }) plan?: PlanDto;
  @ApiPropertyOptional({ type: QueryResultDto }) query?: QueryResultDto;
  @ApiPropertyOptional({ type: [CitationDto] }) citations?: CitationDto[];
}

export class ExecutionResultDto {
  @ApiProperty({ format: 'uuid' }) planId!: string;
  @ApiProperty({ enum: ['EXECUTED', 'PARTIAL', 'FAILED'] }) status!:
    'EXECUTED' | 'PARTIAL' | 'FAILED';
  @ApiProperty({ type: [StepResultDto] }) steps!: StepResultDto[];
  @ApiProperty({ type: PlanDto }) plan!: PlanDto;
}

export class DigestItemDto {
  @ApiProperty() factKey!: string;
  @ApiProperty() text!: string;
  @ApiProperty() count!: number;
  @ApiProperty({ description: 'Pantalla donde se resuelve' }) href!: string;
}

export class DigestDto {
  @ApiProperty() headline!: string;
  @ApiProperty({ type: [DigestItemDto] }) items!: DigestItemDto[];
  @ApiProperty({ enum: ['AI', 'TEMPLATE'], description: 'TEMPLATE = resumen automático (sin IA)' })
  source!: 'AI' | 'TEMPLATE';
  @ApiProperty({ type: String, format: 'date-time' }) generatedAt!: Date;
  @ApiProperty({
    description: 'false si el asistente de chat no está disponible (input deshabilitado)',
  })
  chatAvailable!: boolean;
}
