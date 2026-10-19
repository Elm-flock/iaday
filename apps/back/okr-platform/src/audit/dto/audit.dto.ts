import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Espeja el enum Prisma AuditAction (un spec verifica que no diverja). Sin acciones de feedback. */
export const AUDIT_ACTIONS = [
  'OBJECTIVE_PUBLISHED',
  'OBJECTIVE_CLOSED',
  'KR_TARGET_CHANGED',
  'KR_SCORE_CHANGED',
  'CYCLE_ACTIVATED',
  'CYCLE_CLOSED',
  'CYCLE_THRESHOLDS_CHANGED',
  'USER_ROLE_CHANGED',
  'USER_DEACTIVATED',
  'REFRESH_REUSE_DETECTED',
  'REFRESH_REVOKED_USED',
  'AI_CONTENT_ADAPTED',
  'AI_CONTENT_VALIDATED',
  'AI_SUGGESTION_ACCEPTED',
  'ADAPTATION_REQUEST_CREATED',
  'ADAPTATION_REQUEST_ASSIGNED',
  'ADAPTATION_REQUEST_DELIVERED',
  'ADAPTATION_REQUEST_REJECTED',
  'USER_PASSWORD_CHANGED',
  'ASSISTANT_PLAN_CONFIRMED',
  'ASSISTANT_PLAN_DISCARDED',
  'ASSISTANT_ACTION_EXECUTED',
  'ASSISTANT_ACTION_FAILED',
] as const;
export type AuditActionName = (typeof AUDIT_ACTIONS)[number];

export class ListAuditQueryDto {
  @ApiPropertyOptional({ example: 'KeyResult' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  entityType?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Usuario que ejecutó la acción' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ enum: AUDIT_ACTIONS })
  @IsOptional()
  @IsIn(AUDIT_ACTIONS)
  action?: AuditActionName;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Desde (inclusive)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Hasta (inclusive)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

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

export class AuditEntryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) actorId!: string | null;
  @ApiProperty({ enum: AUDIT_ACTIONS }) action!: AuditActionName;
  @ApiProperty() entityType!: string;
  @ApiProperty({ format: 'uuid' }) entityId!: string;
  @ApiProperty({ nullable: true, type: 'object', additionalProperties: true })
  before!: unknown;
  @ApiProperty({ nullable: true, type: 'object', additionalProperties: true })
  after!: unknown;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}

export class AuditPageDto {
  @ApiProperty({ type: [AuditEntryDto] }) items!: AuditEntryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
