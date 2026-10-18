import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

export class RangeQueryDto {
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Desde (default: hace 30 días)',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Hasta (default: ahora)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

export class UsageRowDto {
  @ApiProperty({ description: 'Feature o modelo según la tabla' }) key!: string;
  @ApiProperty() calls!: number;
  @ApiProperty() failedCalls!: number;
  @ApiProperty() inputTokens!: number;
  @ApiProperty() outputTokens!: number;
  @ApiProperty({
    description: 'ESTIMACIÓN en USD según la tabla de precios del agente (el free tier no factura)',
  })
  costUsdEst!: number;
  @ApiProperty({ type: Number, nullable: true }) latencyP50Ms!: number | null;
  @ApiProperty({ type: Number, nullable: true }) latencyP95Ms!: number | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Fracción de llamadas hechas con el modelo de fallback',
  })
  fallbackRate!: number | null;
}

export class FailureRowDto {
  @ApiProperty() step!: string;
  @ApiProperty({ type: String, nullable: true }) errorCode!: string | null;
  @ApiProperty() count!: number;
}

export class UsageDto {
  @ApiProperty({ type: String, format: 'date-time' }) from!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) to!: Date;
  @ApiProperty({ type: [UsageRowDto] }) byFeature!: UsageRowDto[];
  @ApiProperty({ type: [UsageRowDto] }) byModel!: UsageRowDto[];
  @ApiProperty({ type: [FailureRowDto] }) failures!: FailureRowDto[];
}

export class ImpactAdoptionDto {
  @ApiProperty() adaptationsTotal!: number;
  @ApiProperty({ description: 'ACCEPTED o VALIDATED' }) adaptationsAccepted!: number;
  @ApiProperty({ type: Number, nullable: true }) adaptationAcceptanceRate!: number | null;
  @ApiProperty() suggestionsTotal!: number;
  @ApiProperty() suggestionsAccepted!: number;
  @ApiProperty({ type: Number, nullable: true }) suggestionAcceptanceRate!: number | null;
}

export class ImpactTimeDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'p50 de la latencia pedido->entrega de una adaptación (ms)',
  })
  adaptationLatencyP50Ms!: number | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'p50 del tiempo hasta aceptar/descartar una sugerencia (ms)',
  })
  decisionTimeP50Ms!: number | null;
}

export class ImpactQualityDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Delta medio de Szigriszt-Pazos origen -> salida (sin NEEDS_REVIEW)',
  })
  meanReadabilityDelta!: number | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Fracción de adaptaciones en NEEDS_REVIEW',
  })
  needsReviewRate!: number | null;
}

export class ImpactCostByFeatureDto {
  @ApiProperty() feature!: string;
  @ApiProperty() costUsdEst!: number;
}

export class ImpactCostDto {
  @ApiProperty({ description: 'ESTIMACIÓN en USD' }) totalCostUsdEst!: number;
  @ApiProperty({ description: 'Personas distintas que usaron la IA (solo conteo)' })
  activeUsers!: number;
  @ApiProperty({ type: Number, nullable: true }) costPerActiveUserUsdEst!: number | null;
  @ApiProperty({ type: [ImpactCostByFeatureDto] }) byFeature!: ImpactCostByFeatureDto[];
}

export class ImpactDto {
  @ApiProperty({ type: String, format: 'date-time' }) from!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) to!: Date;
  @ApiProperty({ type: ImpactAdoptionDto }) adoption!: ImpactAdoptionDto;
  @ApiProperty({ type: ImpactTimeDto }) time!: ImpactTimeDto;
  @ApiProperty({ type: ImpactQualityDto }) quality!: ImpactQualityDto;
  @ApiProperty({ type: ImpactCostDto }) cost!: ImpactCostDto;
}
