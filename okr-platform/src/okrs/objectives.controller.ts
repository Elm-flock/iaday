import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import {
  CreateObjectiveDto,
  ListObjectivesQueryDto,
  ObjectiveDto,
  UpdateObjectiveDto,
} from './dto/objective.dto';
import { ObjectivesService } from './objectives.service';

@ApiTags('objectives')
@ApiBearerAuth('JWT-auth')
@Controller('objectives')
export class ObjectivesController {
  constructor(private readonly objectives: ObjectivesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Lista objetivos (filtros opcionales). PUBLISHED/CLOSED son visibles para todos; los DRAFT solo para quienes pueden editarlos.',
  })
  @ApiOkResponse({ type: [ObjectiveDto] })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListObjectivesQueryDto,
  ): Promise<ObjectiveDto[]> {
    return this.objectives.list(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle del objetivo con sus KRs' })
  @ApiOkResponse({ type: ObjectiveDto })
  @ApiNotFoundResponse({ description: 'Inexistente o DRAFT que el actor no puede ver' })
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ObjectiveDto> {
    return this.objectives.get(user, id);
  }

  @Post()
  @ApiOperation({
    summary:
      'Crea un objetivo DRAFT. MEMBER: propio; LEADER: propio o de equipos que lidera; ADMIN: cualquiera.',
  })
  @ApiCreatedResponse({ type: ObjectiveDto })
  @ApiBadRequestResponse({
    description: 'Owner no exclusivo, origin/type inválidos o campos no declarados',
  })
  @ApiForbiddenResponse({ description: 'El actor no puede crear para ese owner' })
  @ApiNotFoundResponse({ description: 'Ciclo, owner o padre inexistente' })
  @ApiConflictResponse({ description: 'Ciclo cerrado' })
  @ApiUnprocessableEntityResponse({
    description: 'Límite de 5 objetivos (OBJECTIVE_LIMIT_EXCEEDED) o padre no publicado',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateObjectiveDto): Promise<ObjectiveDto> {
    return this.objectives.create(user, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Edita un objetivo (owner, líder del equipo owner o ADMIN). Tras publicar solo título, descripción y alineación.',
  })
  @ApiOkResponse({ type: ObjectiveDto })
  @ApiBadRequestResponse({ description: 'Campos no editables o alineación inválida (ciclo/auto)' })
  @ApiForbiddenResponse({ description: 'Sin permiso de edición' })
  @ApiNotFoundResponse({ description: 'Inexistente o DRAFT que el actor no puede ver' })
  @ApiConflictResponse({ description: 'CLOSED, ciclo cerrado o campos bloqueados tras publicar' })
  @ApiUnprocessableEntityResponse({ description: 'Padre no publicado' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateObjectiveDto,
  ): Promise<ObjectiveDto> {
    return this.objectives.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Borra un objetivo DRAFT (y sus KRs)' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Sin permiso de edición' })
  @ApiNotFoundResponse({ description: 'Inexistente o DRAFT que el actor no puede ver' })
  @ApiConflictResponse({ description: 'No está en DRAFT, o ciclo cerrado' })
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.objectives.remove(user, id);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Publica el objetivo (DRAFT -> PUBLISHED): exige al menos 3 objetivos del owner en el ciclo y 3 KRs en este',
  })
  @ApiOkResponse({ type: ObjectiveDto })
  @ApiForbiddenResponse({ description: 'Sin permiso de edición' })
  @ApiNotFoundResponse({ description: 'Inexistente o DRAFT que el actor no puede ver' })
  @ApiConflictResponse({ description: 'No está en DRAFT, o ciclo cerrado' })
  @ApiUnprocessableEntityResponse({
    description: 'MIN_OBJECTIVES_NOT_MET o MIN_KRS_NOT_MET (o límites superados)',
  })
  publish(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ObjectiveDto> {
    return this.objectives.publish(user, id);
  }
}
