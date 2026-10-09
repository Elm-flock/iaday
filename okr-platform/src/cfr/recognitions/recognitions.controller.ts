import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import {
  CreateRecognitionDto,
  ListRecognitionsQueryDto,
  RecognitionDto,
  RecognitionPageDto,
} from './dto/recognition.dto';
import { RecognitionsService } from './recognitions.service';

/** Muro de reconocimientos PÚBLICO (sin ranking ni leaderboard, por diseño). */
@ApiTags('recognitions')
@ApiBearerAuth('JWT-auth')
@Controller('recognitions')
export class RecognitionsController {
  constructor(private readonly recognitions: RecognitionsService) {}

  @Post()
  @ApiOperation({
    summary:
      'Reconoce a otra persona, con enlace opcional a un hito (KR con score >= 0.7 u objetivo CLOSED).',
  })
  @ApiCreatedResponse({ type: RecognitionDto })
  @ApiBadRequestResponse({
    description: 'Autoreconocimiento, mensaje inválido o KR de otro objetivo',
  })
  @ApiNotFoundResponse({ description: 'Persona, objetivo o KR inexistente o no visible' })
  @ApiUnprocessableEntityResponse({
    description: 'El enlace no es un hito (MILESTONE_NOT_REACHED)',
  })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRecognitionDto,
  ): Promise<RecognitionDto> {
    return this.recognitions.create(user, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Muro público de reconocimientos (cualquier autenticado), del más nuevo al más viejo',
  })
  @ApiOkResponse({ type: RecognitionPageDto })
  list(@Query() query: ListRecognitionsQueryDto): Promise<RecognitionPageDto> {
    return this.recognitions.list(query);
  }
}
