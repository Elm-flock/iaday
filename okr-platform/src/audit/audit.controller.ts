import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { AuditPageDto, ListAuditQueryDto } from './dto/audit.dto';

/** Solo lectura: el AuditLog es append-only (sin endpoints de escritura ni borrado). */
@ApiTags('audit')
@ApiBearerAuth('JWT-auth')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Roles('ADMIN')
  @Get()
  @ApiOperation({
    summary:
      'Consulta del registro de auditoría (solo ADMIN) con filtros por entidad, actor, acción y rango de fechas; paginado, del más nuevo al más viejo.',
  })
  @ApiOkResponse({ type: AuditPageDto })
  @ApiBadRequestResponse({ description: 'Filtros o paginación inválidos' })
  @ApiForbiddenResponse({ description: 'Solo ADMIN' })
  list(@Query() query: ListAuditQueryDto): Promise<AuditPageDto> {
    return this.audit.list(query);
  }
}
