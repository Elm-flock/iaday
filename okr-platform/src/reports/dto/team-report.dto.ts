import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

const BANDS = ['RED', 'YELLOW', 'GREEN'] as const;
const OBJECTIVE_TYPES = ['COMMITTED', 'ASPIRATIONAL'] as const;
const ORIGINS = ['TOP_DOWN', 'BOTTOM_UP'] as const;
const OBJECTIVE_STATUSES = ['PUBLISHED', 'CLOSED'] as const;
const CYCLE_KINDS = ['ANNUAL', 'QUARTER'] as const;
const CYCLE_STATUSES = ['DRAFT', 'ACTIVE', 'CLOSED'] as const;
const KR_SCORINGS = ['DERIVED', 'MANUAL'] as const;

export class TeamReportQueryDto {
  @ApiProperty({ format: 'uuid', description: 'Ciclo del reporte (obligatorio)' })
  @IsUUID()
  cycleId!: string;
}

export class ReportTeamDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
}

export class ReportCycleDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: CYCLE_KINDS }) kind!: (typeof CYCLE_KINDS)[number];
  @ApiProperty({ enum: CYCLE_STATUSES }) status!: (typeof CYCLE_STATUSES)[number];
  @ApiProperty({ description: 'Umbral de logro de objetivos COMMITTED (0..1)' })
  committedThreshold!: number;
  @ApiProperty({ description: 'Umbral de logro de objetivos ASPIRATIONAL (0..1)' })
  aspirationalThreshold!: number;
}

export class ReportOriginMixDto {
  @ApiProperty() topDown!: number;
  @ApiProperty() bottomUp!: number;
  @ApiProperty({ type: Number, nullable: true, description: 'null si no hay objetivos' })
  bottomUpRatio!: number | null;
  @ApiProperty({ description: 'true si el % bottom-up queda fuera de [40%, 60%] (solo indicador)' })
  warning!: boolean;
}

export class ReportKeyResultDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: KR_SCORINGS }) scoring!: (typeof KR_SCORINGS)[number];
  @ApiProperty({ type: String, nullable: true }) unit!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Decimal como string' })
  startValue!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Decimal como string' })
  targetValue!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Decimal como string' })
  currentValue!: string | null;
  @ApiProperty({ description: 'Score 0..1' }) score!: number;
  @ApiProperty({ enum: BANDS, description: 'Banda sobre el score' })
  band!: (typeof BANDS)[number];
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastCheckInAt!: Date | null;
}

export class ReportObjectiveDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: OBJECTIVE_TYPES }) type!: (typeof OBJECTIVE_TYPES)[number];
  @ApiProperty({ enum: ORIGINS }) origin!: (typeof ORIGINS)[number];
  @ApiProperty({ enum: OBJECTIVE_STATUSES }) status!: (typeof OBJECTIVE_STATUSES)[number];
  @ApiProperty({ description: 'Score vigente 0..1' }) score!: number;
  @ApiProperty({ enum: BANDS }) band!: (typeof BANDS)[number];
  @ApiProperty({ type: Number, nullable: true, description: 'Score al cierre (solo CLOSED)' })
  finalScore!: number | null;
  @ApiProperty({
    type: Boolean,
    nullable: true,
    description: 'Logro al cierre según el umbral del ciclo (solo CLOSED)',
  })
  achieved!: boolean | null;
  @ApiProperty({ type: [ReportKeyResultDto] }) keyResults!: ReportKeyResultDto[];
}

export class ReportMemberDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({
    type: [ReportObjectiveDto],
    description: 'Objetivos individuales PUBLISHED/CLOSED de la persona en el ciclo',
  })
  objectives!: ReportObjectiveDto[];
}

/**
 * Contrato estable del reporte de equipo (alimenta el PDF). Por diseño NO incluye feedback,
 * reconocimientos, rankings ni comparativas entre personas, ni datos de compensación:
 * los miembros salen en orden alfabético (nunca por score).
 */
export class TeamReportDto {
  @ApiProperty({ type: ReportTeamDto }) team!: ReportTeamDto;
  @ApiProperty({ type: ReportCycleDto }) cycle!: ReportCycleDto;
  @ApiProperty({ type: String, format: 'date-time' }) generatedAt!: Date;
  @ApiProperty({
    type: ReportOriginMixDto,
    description: 'Mezcla de origen sobre los objetivos incluidos en el reporte',
  })
  originMix!: ReportOriginMixDto;
  @ApiProperty({ type: [ReportObjectiveDto], description: 'Objetivos cuyo owner es el equipo' })
  teamObjectives!: ReportObjectiveDto[];
  @ApiProperty({
    type: [ReportMemberDto],
    description: 'Miembros directos del equipo, orden alfabético, con sus objetivos individuales',
  })
  members!: ReportMemberDto[];
}
