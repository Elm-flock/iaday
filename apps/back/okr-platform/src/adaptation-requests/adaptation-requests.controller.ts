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
  Query,
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
import { AdaptationRequestsService } from './adaptation-requests.service';
import {
  AdaptationRequestDto,
  AdaptationRequestPageDto,
  AssignAdaptationRequestDto,
  CreateAdaptationRequestDto,
  DeliverAdaptationRequestDto,
  ListAdaptationRequestsQueryDto,
  MyAdaptationRequestsQueryDto,
  RejectAdaptationRequestDto,
} from './dto/adaptation-request.dto';

/**
 * Pedidos de un documento adaptado a una persona (RD 707/2026 art. 14.5). Cualquier persona pide y
 * sigue los suyos; ADMIN los gestiona. Quien no es dueño ni ADMIN recibe 404.
 */
@ApiTags('adaptation-requests')
@ApiBearerAuth('JWT-auth')
@Controller('adaptation-requests')
export class AdaptationRequestsController {
  constructor(private readonly requests: AdaptationRequestsService) {}

  @Post()
  @ApiOperation({
    summary:
      'Pide un documento adaptado a una persona (plazo configurable, 10 días por defecto). Un feedback solo se vincula si lo enviaste o recibiste.',
  })
  @ApiCreatedResponse({ type: AdaptationRequestDto })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
  @ApiNotFoundResponse({ description: 'El elemento vinculado no existe o no podés verlo' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAdaptationRequestDto,
  ): Promise<AdaptationRequestDto> {
    return this.requests.create(user, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Mis pedidos, del más nuevo al más viejo' })
  @ApiOkResponse({ type: AdaptationRequestPageDto })
  mine(
    @CurrentUser() user: AuthUser,
    @Query() query: MyAdaptationRequestsQueryDto,
  ): Promise<AdaptationRequestPageDto> {
    return this.requests.listMine(user, query);
  }

  @Roles('ADMIN')
  @Get()
  @ApiOperation({
    summary: 'Todos los pedidos (solo ADMIN), filtrables por estado y por vencidos; paginado.',
  })
  @ApiOkResponse({ type: AdaptationRequestPageDto })
  @ApiForbiddenResponse({ description: 'Solo ADMIN' })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListAdaptationRequestsQueryDto,
  ): Promise<AdaptationRequestPageDto> {
    return this.requests.listAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un pedido (quien lo hizo o ADMIN; el resto, 404)' })
  @ApiOkResponse({ type: AdaptationRequestDto })
  @ApiNotFoundResponse({ description: 'No existe o no es tuyo' })
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdaptationRequestDto> {
    return this.requests.get(user, id);
  }

  @Roles('ADMIN')
  @Patch(':id/assign')
  @ApiOperation({
    summary: 'Asigna el pedido a una persona de administración y lo pasa a EN_CURSO (solo ADMIN)',
  })
  @ApiOkResponse({ type: AdaptationRequestDto })
  @ApiConflictResponse({ description: 'El pedido ya está resuelto' })
  @ApiUnprocessableEntityResponse({ description: 'ADAPTATION_ASSIGNEE_INVALID' })
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignAdaptationRequestDto,
  ): Promise<AdaptationRequestDto> {
    return this.requests.assign(user, id, dto);
  }

  @Roles('ADMIN')
  @Post(':id/deliver')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Entrega el documento adaptado, con nota y enlace opcional (solo ADMIN)',
  })
  @ApiOkResponse({ type: AdaptationRequestDto })
  @ApiConflictResponse({ description: 'El pedido ya está resuelto' })
  @ApiUnprocessableEntityResponse({ description: 'ADAPTATION_DELIVERY_NOTE_REQUIRED' })
  deliver(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeliverAdaptationRequestDto,
  ): Promise<AdaptationRequestDto> {
    return this.requests.deliver(user, id, dto);
  }

  @Roles('ADMIN')
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Rechaza el pedido con justificación obligatoria por escrito (art. 14.5: solo por carga desproporcionada) (solo ADMIN)',
  })
  @ApiOkResponse({ type: AdaptationRequestDto })
  @ApiConflictResponse({ description: 'El pedido ya está resuelto' })
  @ApiUnprocessableEntityResponse({ description: 'ADAPTATION_REJECTION_JUSTIFICATION_REQUIRED' })
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectAdaptationRequestDto,
  ): Promise<AdaptationRequestDto> {
    return this.requests.reject(user, id, dto);
  }
}
