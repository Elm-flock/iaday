import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiGoneResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AiUserThrottlerGuard } from '../ai/ai-user-throttler.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { AssistantAdminGuard } from './assistant-admin.guard';
import { AssistantExecutorService } from './assistant-executor.service';
import { AssistantService } from './assistant.service';
import {
  ConfirmPlanDto,
  DigestDto,
  DigestQueryDto,
  ExecutionResultDto,
  ListMessagesQueryDto,
  MessageDto,
  PlanDto,
  SendMessageDto,
  TurnResultDto,
} from './dto/assistant.dto';

const PLAN_ID = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

/**
 * Asistente de administración. TODO es solo para ADMIN: cualquier otra persona recibe 404 (el guard corre
 * antes que el límite por usuario). El agente propone; acá se valida, se confirma y se ejecuta.
 */
@ApiTags('assistant')
@ApiBearerAuth('JWT-auth')
@UseGuards(AssistantAdminGuard, AiUserThrottlerGuard)
@Controller('assistant')
export class AssistantController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly executor: AssistantExecutorService,
  ) {}

  @Get('digest')
  @ApiOperation({
    summary:
      'Novedades para administración: hechos calculados de forma determinista + resumen en lenguaje claro (IA o plantilla). Caché de 10 minutos; `refresh=true` la ignora.',
  })
  @ApiOkResponse({ type: DigestDto })
  @ApiNotFoundResponse({ description: 'No sos ADMIN' })
  digest(@CurrentUser() admin: AuthUser, @Query() query: DigestQueryDto): Promise<DigestDto> {
    return this.assistant.getDigest(admin, query.refresh === true);
  }

  @Get('messages')
  @ApiOperation({
    summary: 'Conversación propia (los últimos mensajes, del más viejo al más nuevo)',
  })
  @ApiOkResponse({ type: [MessageDto] })
  @ApiNotFoundResponse({ description: 'No sos ADMIN' })
  messages(
    @CurrentUser() admin: AuthUser,
    @Query() query: ListMessagesQueryDto,
  ): Promise<MessageDto[]> {
    return this.assistant.listMessages(admin, query.limit);
  }

  @Post('messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Un turno de chat. La respuesta puede traer un plan (a confirmar), el resultado de una consulta de auditoría, ayuda citando el manual o un texto.',
  })
  @ApiOkResponse({ type: TurnResultDto })
  @ApiNotFoundResponse({ description: 'No sos ADMIN' })
  @ApiServiceUnavailableResponse({
    description: 'AI_UNAVAILABLE / AI_DISABLED: el resto de la API sigue igual',
  })
  @ApiUnprocessableEntityResponse({ description: 'AI_INPUT_REJECTED: el mensaje se rechazó' })
  send(@CurrentUser() admin: AuthUser, @Body() dto: SendMessageDto): Promise<TurnResultDto> {
    return this.assistant.turn(admin, dto.text);
  }

  @Post('plans/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Confirma y ejecuta un plan con su planHash. Se frena en el primer paso que falla (sin rollback). Devuelve el resultado por paso; la clave inicial de un alta viaja solo acá, una vez.',
  })
  @ApiOkResponse({ type: ExecutionResultDto })
  @ApiNotFoundResponse({
    description: 'ASSISTANT_PLAN_NOT_FOUND (inexistente o de otra persona) o no sos ADMIN',
  })
  @ApiGoneResponse({ description: 'ASSISTANT_PLAN_EXPIRED: pasaron los 15 minutos' })
  @ApiConflictResponse({
    description: 'ASSISTANT_PLAN_HASH_MISMATCH o ASSISTANT_PLAN_ALREADY_DECIDED (trae `result`)',
  })
  @ApiUnprocessableEntityResponse({
    description: 'ASSISTANT_PLAN_INVALID: el plan tiene problemas',
  })
  confirm(
    @CurrentUser() admin: AuthUser,
    @Param('id', PLAN_ID) id: string,
    @Body() dto: ConfirmPlanDto,
  ): Promise<ExecutionResultDto> {
    return this.executor.confirm(admin, id, dto.planHash);
  }

  @Post('plans/:id/discard')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Descarta un plan que todavía no se ejecutó' })
  @ApiOkResponse({ type: PlanDto })
  @ApiNotFoundResponse({ description: 'ASSISTANT_PLAN_NOT_FOUND o no sos ADMIN' })
  @ApiConflictResponse({ description: 'ASSISTANT_PLAN_ALREADY_DECIDED' })
  discard(@CurrentUser() admin: AuthUser, @Param('id', PLAN_ID) id: string): Promise<PlanDto> {
    return this.executor.discard(admin, id);
  }

  @Delete('conversation')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Borra la conversación propia: todos los mensajes y los planes que no se ejecutaron. Los planes ejecutados se conservan 90 días por trazabilidad.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'No sos ADMIN' })
  deleteConversation(@CurrentUser() admin: AuthUser): Promise<void> {
    return this.assistant.deleteConversation(admin);
  }
}
