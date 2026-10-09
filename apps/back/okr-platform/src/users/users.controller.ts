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
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto, UserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth('JWT-auth')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Directorio de usuarios (cualquier usuario autenticado)' })
  @ApiOkResponse({ type: [UserDto] })
  list(): Promise<UserDto[]> {
    return this.users.list();
  }

  @Roles('ADMIN')
  @Post()
  @ApiOperation({ summary: 'Crea un usuario (solo ADMIN; no hay auto-registro)' })
  @ApiCreatedResponse({ type: UserDto })
  @ApiForbiddenResponse({ description: 'Rol insuficiente' })
  @ApiConflictResponse({ description: 'El email ya existe' })
  create(@Body() dto: CreateUserDto): Promise<UserDto> {
    return this.users.create(dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  @ApiOperation({ summary: 'Edita nombre, rol o estado activo (solo ADMIN)' })
  @ApiOkResponse({ type: UserDto })
  @ApiNotFoundResponse({ description: 'Usuario inexistente' })
  @ApiUnprocessableEntityResponse({
    description: 'El ADMIN no puede cambiar su propio rol ni desactivarse',
  })
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserDto> {
    return this.users.update(actor, id, dto);
  }

  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':id/password')
  @ApiOperation({ summary: 'Resetea la clave de un usuario y revoca sus sesiones (solo ADMIN)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Usuario inexistente' })
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
  ): Promise<void> {
    return this.users.resetPassword(id, dto.password);
  }
}
