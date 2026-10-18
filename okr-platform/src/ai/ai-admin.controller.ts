import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { AiMetricsService } from './ai-metrics.service';
import { ImpactDto, RangeQueryDto, UsageDto } from './dto/metrics.dto';

@ApiTags('ai')
@ApiBearerAuth('JWT-auth')
@Roles('ADMIN')
@Controller('ai')
export class AiAdminController {
  constructor(private readonly metrics: AiMetricsService) {}

  @Get('usage')
  @ApiOperation({
    summary:
      'Uso de IA por feature y por modelo: llamadas, fallos por paso, tokens, costo ESTIMADO y latencia p50/p95 (solo ADMIN)',
  })
  @ApiOkResponse({ type: UsageDto })
  @ApiForbiddenResponse({ description: 'Solo ADMIN' })
  usage(@Query() query: RangeQueryDto): Promise<UsageDto> {
    return this.metrics.usage(query);
  }

  @Get('impact')
  @ApiOperation({
    summary:
      'Impacto: adopción, tiempos, calidad de legibilidad y costo estimado por usuario activo. Agregado, sin datos por persona (solo ADMIN)',
  })
  @ApiOkResponse({ type: ImpactDto })
  @ApiForbiddenResponse({ description: 'Solo ADMIN' })
  impact(@Query() query: RangeQueryDto): Promise<ImpactDto> {
    return this.metrics.impact(query);
  }
}
