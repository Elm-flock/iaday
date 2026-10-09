import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { CheckInsService } from './check-ins.service';
import { CheckInDto, CreateCheckInDto, PendingCheckInDto } from './dto/check-in.dto';

@ApiTags('check-ins')
@ApiBearerAuth('JWT-auth')
@Controller()
export class CheckInsController {
  constructor(private readonly checkIns: CheckInsService) {}

  @Post('key-results/:id/check-ins')
  @ApiOperation({
    summary:
      'Registra un check-in del KR (responsable del KR, dueño del objetivo, miembros del equipo owner o su líder; sin bypass de ADMIN). Guarda snapshot de score y banda, recalcula KR y objetivo y audita KR_SCORE_CHANGED.',
  })
  @ApiCreatedResponse({ type: CheckInDto })
  @ApiBadRequestResponse({
    description: 'Acción inválida o valor/score incoherente con el tipo de KR',
  })
  @ApiForbiddenResponse({ description: 'No sos responsable ni del equipo owner' })
  @ApiNotFoundResponse({ description: 'KR inexistente u objetivo DRAFT no visible' })
  @ApiConflictResponse({ description: 'Objetivo DRAFT/CLOSED o ciclo cerrado' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCheckInDto,
  ): Promise<CheckInDto> {
    return this.checkIns.create(user, id, dto);
  }

  @Get('key-results/:id/check-ins')
  @ApiOperation({ summary: 'Historial de check-ins del KR, del más nuevo al más viejo' })
  @ApiOkResponse({ type: [CheckInDto] })
  @ApiNotFoundResponse({ description: 'KR inexistente u objetivo DRAFT no visible' })
  history(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CheckInDto[]> {
    return this.checkIns.history(user, id);
  }

  @Get('check-ins/pending')
  @ApiOperation({
    summary:
      'Mis KRs vencidos: pasó más que la cadencia del ciclo desde el último check-in (o la publicación). Solo indicador, sin notificaciones.',
  })
  @ApiOkResponse({ type: [PendingCheckInDto] })
  pending(@CurrentUser() user: AuthUser): Promise<PendingCheckInDto[]> {
    return this.checkIns.pending(user);
  }
}
