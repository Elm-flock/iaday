import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { AuthService } from './auth.service';
import { AuthSessionDto, MeDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

/** Límite de login/refresh por minuto e IP. Configurable por env solo para e2e (default 5). */
const authThrottle = {
  default: { limit: () => Number(process.env.LOGIN_THROTTLE_LIMIT ?? 5), ttl: 60_000 },
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(authThrottle)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ summary: 'Login con email y password' })
  @ApiOkResponse({ type: AuthSessionDto })
  @ApiUnauthorizedResponse({
    description: 'Credenciales inválidas (sin distinguir email/password)',
  })
  @ApiTooManyRequestsResponse({ description: 'Demasiados intentos' })
  login(@Body() dto: LoginDto): Promise<AuthSessionDto> {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @Throttle(authThrottle)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @ApiOperation({ summary: 'Rota el refresh token y emite un nuevo access token' })
  @ApiOkResponse({ type: AuthSessionDto })
  @ApiUnauthorizedResponse({
    description: 'Refresh desconocido, vencido, reutilizado o en carrera',
  })
  refresh(@Body() dto: RefreshDto): Promise<AuthSessionDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @ApiOperation({ summary: 'Revoca la familia del refresh token (idempotente)' })
  @ApiNoContentResponse()
  logout(@Body() dto: RefreshDto): Promise<void> {
    return this.auth.logout(dto.refreshToken);
  }

  @ApiBearerAuth('JWT-auth')
  @Get('me')
  @ApiOperation({ summary: 'Perfil del usuario autenticado' })
  @ApiOkResponse({ type: MeDto })
  @ApiUnauthorizedResponse({ description: 'Token ausente, inválido o usuario desactivado' })
  me(@CurrentUser() user: AuthUser): Promise<MeDto> {
    return this.auth.me(user.id);
  }
}
