import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export const FEEDBACK_BOXES = ['received', 'sent'] as const;
export type FeedbackBox = (typeof FEEDBACK_BOXES)[number];

export class CreateFeedbackDto {
  @ApiProperty({ format: 'uuid', description: 'Destinatario (no puede ser uno mismo)' })
  @IsUUID()
  toUserId!: string;

  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Objetivo visible al que se refiere' })
  @IsOptional()
  @IsUUID()
  objectiveId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'KR visible al que se refiere' })
  @IsOptional()
  @IsUUID()
  keyResultId?: string;
}

export class UpdateFeedbackDto {
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;
}

export class ListFeedbackQueryDto {
  @ApiPropertyOptional({
    enum: FEEDBACK_BOXES,
    description: 'Sin valor: recibidos y enviados',
  })
  @IsOptional()
  @IsIn(FEEDBACK_BOXES)
  box?: FeedbackBox;
}

export class FeedbackDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) fromUserId!: string;
  @ApiProperty({ format: 'uuid' }) toUserId!: string;
  @ApiProperty() content!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) objectiveId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) keyResultId!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) readAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}
