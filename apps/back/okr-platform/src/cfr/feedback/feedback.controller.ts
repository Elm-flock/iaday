import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import {
  CreateFeedbackDto,
  FeedbackDto,
  ListFeedbackQueryDto,
  UpdateFeedbackDto,
} from './dto/feedback.dto';
import { FeedbackService } from './feedback.service';

/** Feedback privado: solo emisor y receptor (sin bypass de ADMIN/LEADER). Un ajeno recibe 404. */
@ApiTags('feedback')
@ApiBearerAuth('JWT-auth')
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  @ApiOperation({ summary: 'Envía feedback privado a otro usuario (no a uno mismo)' })
  @ApiCreatedResponse({ type: FeedbackDto })
  @ApiBadRequestResponse({ description: 'Autoenvío, contenido inválido o KR de otro objetivo' })
  @ApiNotFoundResponse({ description: 'Destinatario, objetivo o KR inexistente o no visible' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFeedbackDto): Promise<FeedbackDto> {
    return this.feedback.create(user, dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'Mi feedback (recibido y/o enviado, según `box`), del más nuevo al más viejo. El filtro de privacidad está en el WHERE.',
  })
  @ApiOkResponse({ type: [FeedbackDto] })
  @ApiBadRequestResponse({ description: 'box inválido' })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListFeedbackQueryDto,
  ): Promise<FeedbackDto[]> {
    return this.feedback.list(user, query.box);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalle: solo emisor o receptor (cualquier otro, incluido ADMIN, recibe 404)',
  })
  @ApiOkResponse({ type: FeedbackDto })
  @ApiNotFoundResponse({ description: 'Inexistente o ajeno (indistinguibles)' })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<FeedbackDto> {
    return this.feedback.get(user, id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'El destinatario marca el feedback como leído (idempotente)' })
  @ApiOkResponse({ type: FeedbackDto })
  @ApiForbiddenResponse({ description: 'Lo ve pero no es el destinatario' })
  @ApiNotFoundResponse({ description: 'Inexistente o ajeno' })
  markRead(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FeedbackDto> {
    return this.feedback.markRead(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'El autor edita el contenido de su feedback' })
  @ApiOkResponse({ type: FeedbackDto })
  @ApiBadRequestResponse({ description: 'Contenido inválido' })
  @ApiForbiddenResponse({ description: 'Lo ve pero no es el autor' })
  @ApiNotFoundResponse({ description: 'Inexistente o ajeno' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFeedbackDto,
  ): Promise<FeedbackDto> {
    return this.feedback.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'El autor borra su feedback' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Lo ve pero no es el autor' })
  @ApiNotFoundResponse({ description: 'Inexistente o ajeno' })
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.feedback.remove(user, id);
  }
}
