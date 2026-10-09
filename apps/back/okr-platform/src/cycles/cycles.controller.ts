import {
  Body,
  Controller,
  Get,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { CyclesService } from './cycles.service';
import { CreateCycleDto, CycleCloseDto, CycleDto, UpdateCycleDto } from './dto/cycle.dto';

@ApiTags('cycles')
@ApiBearerAuth('JWT-auth')
@Controller('cycles')
export class CyclesController {
  constructor(private readonly cycles: CyclesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista los ciclos por fecha de inicio' })
  @ApiOkResponse({ type: [CycleDto] })
  list(): Promise<CycleDto[]> {
    return this.cycles.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un ciclo' })
  @ApiOkResponse({ type: CycleDto })
  @ApiNotFoundResponse({ description: 'Ciclo inexistente' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<CycleDto> {
    return this.cycles.get(id);
  }

  @Roles('ADMIN')
  @Post()
  @ApiOperation({
    summary: 'Crea un ciclo ANNUAL o QUARTER con cadencia y umbrales (solo ADMIN)',
  })
  @ApiCreatedResponse({ type: CycleDto })
  @ApiForbiddenResponse({ description: 'Rol insuficiente' })
  @ApiBadRequestResponse({
    description: 'Fechas, jerarquía o umbrales inválidos (REQ-CYC-1/2)',
  })
  @ApiNotFoundResponse({ description: 'Ciclo padre inexistente' })
  @ApiUnprocessableEntityResponse({ description: 'El QUARTER se solapa con un hermano' })
  create(@Body() dto: CreateCycleDto): Promise<CycleDto> {
    return this.cycles.create(dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  @ApiOperation({
    summary:
      'Edita nombre, cadencia, umbrales (hasta el cierre) y fechas (solo DRAFT). Solo ADMIN.',
  })
  @ApiOkResponse({ type: CycleDto })
  @ApiNotFoundResponse({ description: 'Ciclo inexistente' })
  @ApiConflictResponse({ description: 'Ciclo cerrado, o fechas en un ciclo que no es DRAFT' })
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCycleDto,
  ): Promise<CycleDto> {
    return this.cycles.update(actor, id, dto);
  }

  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @Post(':id/activate')
  @ApiOperation({ summary: 'DRAFT -> ACTIVE (solo ADMIN)' })
  @ApiOkResponse({ type: CycleDto })
  @ApiNotFoundResponse({ description: 'Ciclo inexistente' })
  @ApiUnprocessableEntityResponse({ description: 'Transición inválida' })
  activate(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CycleDto> {
    return this.cycles.activate(actor, id);
  }

  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @Post(':id/close')
  @ApiOperation({
    summary:
      'ACTIVE -> CLOSED: calcula finalScore y achieved de los objetivos PUBLISHED con los umbrales vigentes y audita (solo ADMIN)',
  })
  @ApiOkResponse({ type: CycleCloseDto })
  @ApiNotFoundResponse({ description: 'Ciclo inexistente' })
  @ApiUnprocessableEntityResponse({ description: 'Transición inválida' })
  close(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CycleCloseDto> {
    return this.cycles.close(actor, id);
  }
}
