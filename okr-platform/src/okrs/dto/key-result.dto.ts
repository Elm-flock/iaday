import { ApiProperty } from '@nestjs/swagger';

export const KR_SCORINGS = ['DERIVED', 'MANUAL'] as const;

export class KeyResultDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) objectiveId!: string;
  @ApiProperty({ format: 'uuid' }) ownerId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({
    enum: KR_SCORINGS,
    description: 'DERIVED = numérico; MANUAL = binario (pasos de 0.1)',
  })
  scoring!: (typeof KR_SCORINGS)[number];
  @ApiProperty({ type: String, nullable: true }) unit!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Decimal como string' })
  startValue!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Decimal como string' })
  targetValue!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Decimal como string' })
  currentValue!: string | null;
  @ApiProperty({ description: 'Score 0..1 (4 decimales)' }) score!: number;
  @ApiProperty() position!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastCheckInAt!: Date | null;
}
