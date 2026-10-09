import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class TeamDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) parentId!: string | null;
}

export class TeamNodeDto extends TeamDto {
  @ApiProperty({ type: () => [TeamNodeDto] }) children!: TeamNodeDto[];
}

export class TeamMemberDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() isLead!: boolean;
}

export class OriginMixDto {
  @ApiProperty({ description: 'Objetivos TOP_DOWN del equipo en el ciclo' }) topDown!: number;
  @ApiProperty({ description: 'Objetivos BOTTOM_UP del equipo en el ciclo' }) bottomUp!: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'bottomUp / total; null sin objetivos',
  })
  bottomUpRatio!: number | null;
  @ApiProperty({
    description: 'true si el % BOTTOM_UP queda fuera de [40%, 60%]. Indicador blando.',
  })
  warning!: boolean;
}

export class TeamDetailDto extends TeamDto {
  @ApiProperty({ type: [TeamMemberDto] }) members!: TeamMemberDto[];
  @ApiProperty({
    type: OriginMixDto,
    nullable: true,
    description:
      'Indicador 50/50 de los objetivos propios del equipo; null si no se indica cycleId',
  })
  originMix!: OriginMixDto | null;
}

export class CreateTeamDto {
  @ApiProperty({ example: 'Plataforma' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Omitir solo para la raíz (organización)' })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class UpdateTeamDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Nuevo padre (mover). No puede crear ciclos.',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class TeamDetailQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Ciclo para el cálculo de originMix' })
  @IsOptional()
  @IsUUID()
  cycleId?: string;
}

export class SetMemberDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isLead?: boolean;
}
