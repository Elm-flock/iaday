import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { CreateKeyResultDto, UpdateKeyResultDto } from './dto/key-result-input.dto';
import { KeyResultDto } from './dto/key-result.dto';
import { KeyResultsService } from './key-results.service';

@ApiTags('key-results')
@ApiBearerAuth('JWT-auth')
@Controller()
export class KeyResultsController {
  constructor(private readonly keyResults: KeyResultsService) {}

  @Post('objectives/:id/key-results')
  @ApiOperation({
    summary:
      'Agrega un KR al objetivo (owner, líder del equipo owner o ADMIN). Máximo 5 por objetivo.',
  })
  @ApiCreatedResponse({ type: KeyResultDto })
  @ApiBadRequestResponse({
    description: 'Valores inconsistentes: start == target, faltan o sobran valores según el tipo',
  })
  @ApiForbiddenResponse({ description: 'Sin permiso de edición' })
  @ApiNotFoundResponse({ description: 'Objetivo (o DRAFT no visible) o responsable inexistente' })
  @ApiConflictResponse({ description: 'Objetivo CLOSED o ciclo cerrado' })
  @ApiUnprocessableEntityResponse({ description: 'KR_LIMIT_EXCEEDED (máximo 5)' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) objectiveId: string,
    @Body() dto: CreateKeyResultDto,
  ): Promise<KeyResultDto> {
    return this.keyResults.create(user, objectiveId, dto);
  }

  @Patch('key-results/:id')
  @ApiOperation({
    summary:
      'Edita un KR. Tras publicar, cambiar start/target solo lo hacen ADMIN o líderes (owner team / equipo del owner) y se audita como KR_TARGET_CHANGED.',
  })
  @ApiOkResponse({ type: KeyResultDto })
  @ApiBadRequestResponse({ description: 'Valores inconsistentes o campos no declarados' })
  @ApiForbiddenResponse({ description: 'Sin permiso de edición / de cambio de meta' })
  @ApiNotFoundResponse({ description: 'KR (o su DRAFT no visible) o responsable inexistente' })
  @ApiConflictResponse({ description: 'Objetivo CLOSED o ciclo cerrado' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKeyResultDto,
  ): Promise<KeyResultDto> {
    return this.keyResults.update(user, id, dto);
  }

  @Delete('key-results/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Borra un KR de un objetivo DRAFT' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Sin permiso de edición' })
  @ApiNotFoundResponse({ description: 'KR inexistente o de un DRAFT no visible' })
  @ApiConflictResponse({ description: 'El objetivo no está en DRAFT, o ciclo cerrado' })
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.keyResults.remove(user, id);
  }
}
