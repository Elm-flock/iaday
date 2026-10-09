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
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CreateTeamDto,
  SetMemberDto,
  TeamDetailDto,
  TeamDetailQueryDto,
  TeamDto,
  TeamMemberDto,
  TeamNodeDto,
  UpdateTeamDto,
} from './dto/team.dto';
import { TeamsService } from './teams.service';

@ApiTags('teams')
@ApiBearerAuth('JWT-auth')
@Controller('teams')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  @ApiOperation({ summary: 'Árbol de equipos anidado (raíz única = organización)' })
  @ApiOkResponse({ type: [TeamNodeDto] })
  tree(): Promise<TeamNodeDto[]> {
    return this.teams.tree();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalle del equipo con miembros e indicador 50/50 (si se pasa cycleId)',
  })
  @ApiOkResponse({ type: TeamDetailDto })
  @ApiNotFoundResponse({ description: 'Equipo o ciclo inexistente' })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: TeamDetailQueryDto,
  ): Promise<TeamDetailDto> {
    return this.teams.detail(id, query.cycleId);
  }

  @Roles('ADMIN')
  @Post()
  @ApiOperation({ summary: 'Crea un equipo (solo ADMIN)' })
  @ApiCreatedResponse({ type: TeamDto })
  @ApiForbiddenResponse({ description: 'Rol insuficiente' })
  @ApiNotFoundResponse({ description: 'Padre inexistente' })
  @ApiConflictResponse({ description: 'Raíz duplicada o nombre repetido bajo el mismo padre' })
  create(@Body() dto: CreateTeamDto): Promise<TeamDto> {
    return this.teams.create(dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  @ApiOperation({ summary: 'Renombra o mueve un equipo (solo ADMIN). Sin ciclos en el árbol.' })
  @ApiOkResponse({ type: TeamDto })
  @ApiNotFoundResponse({ description: 'Equipo o padre inexistente' })
  @ApiConflictResponse({ description: 'El movimiento crearía un ciclo o un nombre repetido' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTeamDto): Promise<TeamDto> {
    return this.teams.update(id, dto);
  }

  @Roles('ADMIN')
  @Put(':id/members/:userId')
  @ApiOperation({ summary: 'Agrega un miembro o actualiza isLead (solo ADMIN)' })
  @ApiOkResponse({ type: TeamMemberDto })
  @ApiNotFoundResponse({ description: 'Equipo o usuario inexistente' })
  setMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: SetMemberDto,
  ): Promise<TeamMemberDto> {
    return this.teams.setMember(id, userId, dto.isLead);
  }

  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Quita un miembro del equipo (solo ADMIN)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'El usuario no es miembro del equipo' })
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.teams.removeMember(id, userId);
  }
}
