import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Param,
  ParseUUIDPipe,
  Patch,
  PipeTransform,
  Post,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { AiUserThrottlerGuard } from './ai-user-throttler.guard';
import { AiService } from './ai.service';
import {
  AdaptQueryDto,
  AdaptedContentDto,
  AiStatusDto,
  ValidateAdaptationDto,
} from './dto/adapt.dto';
import { AiSuggestionDto, OkrSuggestDto, SummaryQueryDto } from './dto/suggestion.dto';

// Alias local: con el alias importado, ts-node (emit de openapi) pierde el tipo del @Param.
type AdaptableType = 'OBJECTIVE' | 'CHECK_IN' | 'FEEDBACK';

const TYPE_BY_ROUTE: Record<string, AdaptableType> = {
  objective: 'OBJECTIVE',
  'check-in': 'CHECK_IN',
  feedback: 'FEEDBACK',
};

@Injectable()
class AdaptableTypePipe implements PipeTransform<string, AdaptableType> {
  transform(value: string): AdaptableType {
    const type = TYPE_BY_ROUTE[value];
    if (!type) throw new NotFoundException('Tipo de elemento no soportado');
    return type;
  }
}

const AI_ERRORS =
  'AI_DISABLED / AI_UNAVAILABLE: la ayuda de IA no está disponible (el resto de la API sigue funcionando)';

/**
 * Ayudas de IA para accesibilidad cognitiva (RD 707/2026). El agente solo genera; esta API decide
 * permisos, minimiza datos y es la única que persiste. Los POST/PATCH tienen límite por usuario.
 */
@ApiTags('ai')
@ApiBearerAuth('JWT-auth')
@UseGuards(AiUserThrottlerGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Indica si la ayuda de IA está activada (la UI oculta los botones si no)',
  })
  @ApiOkResponse({ type: AiStatusDto })
  status(): AiStatusDto {
    return this.ai.status();
  }

  @Post('adapt/:entityType/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '[:entityType = objective | check-in | feedback] Genera (o devuelve de la caché) la versión en lectura fácil o lenguaje claro de un objetivo, check-in o feedback. Solo puede pedirla quien puede ver el elemento; el feedback ajeno responde 404 también para ADMIN.',
  })
  @ApiOkResponse({ type: AdaptedContentDto })
  @ApiNotFoundResponse({ description: 'Elemento inexistente o no visible para el actor' })
  @ApiUnprocessableEntityResponse({ description: 'AI_NOTHING_TO_ADAPT o AI_INPUT_REJECTED' })
  @ApiTooManyRequestsResponse({ description: 'AI_RATE_LIMITED (agente o límite por usuario)' })
  @ApiBadGatewayResponse({ description: 'AI_OUTPUT_INVALID' })
  @ApiServiceUnavailableResponse({ description: AI_ERRORS })
  adapt(
    @CurrentUser() user: AuthUser,
    @Param('entityType', AdaptableTypePipe) entityType: AdaptableType,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AdaptQueryDto,
  ): Promise<AdaptedContentDto> {
    return this.ai.adapt(user, entityType, id, query.level);
  }

  @Get('adapt/:entityType/:id')
  @ApiOperation({
    summary:
      '[:entityType = objective | check-in | feedback] Versión accesible vigente (mismo texto de origen) si ya existe',
  })
  @ApiOkResponse({ type: AdaptedContentDto })
  @ApiNotFoundResponse({ description: 'Elemento no visible o AI_ADAPTATION_NOT_FOUND' })
  getAdaptation(
    @CurrentUser() user: AuthUser,
    @Param('entityType', AdaptableTypePipe) entityType: AdaptableType,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AdaptQueryDto,
  ): Promise<AdaptedContentDto> {
    return this.ai.getAdaptation(user, entityType, id, query.level);
  }

  @Post('adapted/:id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Marca que la versión me sirve (solo quien la pidió; DRAFT -> ACCEPTED)',
  })
  @ApiOkResponse({ type: AdaptedContentDto })
  @ApiForbiddenResponse({ description: 'No sos quien pidió la versión' })
  @ApiNotFoundResponse({ description: 'Versión inexistente o elemento de origen no visible' })
  @ApiConflictResponse({ description: 'AI_ADAPTATION_STATE_CONFLICT' })
  accept(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdaptedContentDto> {
    return this.ai.accept(user, id);
  }

  @Patch('adapted/:id/validate')
  @ApiOperation({
    summary:
      'Validación humana de la versión (ADMIN o líder del equipo dueño del objetivo; el feedback no es validable). Puede corregir el contenido.',
  })
  @ApiOkResponse({ type: AdaptedContentDto })
  @ApiForbiddenResponse({ description: 'Sin permiso de validación' })
  @ApiNotFoundResponse({ description: 'Versión inexistente o elemento de origen no visible' })
  @ApiConflictResponse({ description: 'AI_ADAPTATION_STATE_CONFLICT (ya validada)' })
  @ApiUnprocessableEntityResponse({
    description: 'AI_VALIDATION_NOT_ALLOWED (feedback) o AI_EDITED_CONTENT_INVALID',
  })
  validate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ValidateAdaptationDto,
  ): Promise<AdaptedContentDto> {
    return this.ai.validate(user, id, dto);
  }

  @Post('okr-suggest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Sugiere una redacción mejor de un objetivo y sus KRs. No modifica nada: la persona decide si la usa.',
  })
  @ApiOkResponse({ type: AiSuggestionDto })
  @ApiForbiddenResponse({ description: 'No podés editar el objetivo ni crearlo para ese owner' })
  @ApiNotFoundResponse({ description: 'Ciclo u objetivo inexistente o no visible' })
  @ApiServiceUnavailableResponse({ description: AI_ERRORS })
  suggestOkr(@CurrentUser() user: AuthUser, @Body() dto: OkrSuggestDto): Promise<AiSuggestionDto> {
    return this.ai.suggestOkr(user, dto);
  }

  @Post('check-ins/:krId/summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Resume el historial de check-ins de un KR (sin autores; habla del avance, no de personas)',
  })
  @ApiOkResponse({ type: AiSuggestionDto })
  @ApiNotFoundResponse({ description: 'KR inexistente u objetivo no visible' })
  @ApiUnprocessableEntityResponse({ description: 'AI_NOTHING_TO_SUMMARIZE' })
  @ApiServiceUnavailableResponse({ description: AI_ERRORS })
  summarize(
    @CurrentUser() user: AuthUser,
    @Param('krId', ParseUUIDPipe) krId: string,
    @Query() query: SummaryQueryDto,
  ): Promise<AiSuggestionDto> {
    return this.ai.summarize(user, krId, query.level ?? 'STANDARD');
  }

  @Post('suggestions/:id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Acepta una sugerencia (solo quien la pidió). No aplica cambios.' })
  @ApiOkResponse({ type: AiSuggestionDto })
  @ApiNotFoundResponse({ description: 'Sugerencia inexistente o ajena' })
  @ApiConflictResponse({ description: 'AI_SUGGESTION_ALREADY_DECIDED' })
  acceptSuggestion(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AiSuggestionDto> {
    return this.ai.decideSuggestion(user, id, 'accept');
  }

  @Post('suggestions/:id/discard')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Descarta una sugerencia (solo quien la pidió)' })
  @ApiOkResponse({ type: AiSuggestionDto })
  @ApiNotFoundResponse({ description: 'Sugerencia inexistente o ajena' })
  @ApiConflictResponse({ description: 'AI_SUGGESTION_ALREADY_DECIDED' })
  discardSuggestion(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AiSuggestionDto> {
    return this.ai.decideSuggestion(user, id, 'discard');
  }
}
