import { ApiProperty } from '@nestjs/swagger';

export class AuthUserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ['ADMIN', 'LEADER', 'MEMBER'] }) role!: 'ADMIN' | 'LEADER' | 'MEMBER';
}

export class AuthSessionDto {
  @ApiProperty({ description: 'JWT de acceso (15 min)' }) accessToken!: string;
  @ApiProperty({ type: String, format: 'date-time' }) accessExpiresAt!: Date;
  @ApiProperty({ description: 'Refresh opaco rotativo (7 días deslizante, techo 30 días)' })
  refreshToken!: string;
  @ApiProperty({ type: String, format: 'date-time' }) refreshExpiresAt!: Date;
  @ApiProperty({ type: AuthUserDto }) user!: AuthUserDto;
}

export class MeTeamDto {
  @ApiProperty({ format: 'uuid' }) teamId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() isLead!: boolean;
}

export class MeDto extends AuthUserDto {
  @ApiProperty({ type: [MeTeamDto] }) teams!: MeTeamDto[];
}
