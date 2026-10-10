import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { TeamReportDto, TeamReportQueryDto } from './dto/team-report.dto';
import { ReportsService } from './reports.service';

/** Solo nivel equipo: no existe reporte individual, ranking ni comparativa entre personas. */
@ApiTags('reports')
@ApiBearerAuth('JWT-auth')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('teams/:id')
  @ApiOperation({
    summary:
      'Reporte del equipo en un ciclo (solo ADMIN o líder del equipo): objetivos del equipo y objetivos individuales de sus miembros agrupados por persona, con KRs, scores, bandas, mezcla de origen y logro al cierre. Sin feedback, ranking ni datos de compensación.',
  })
  @ApiOkResponse({ type: TeamReportDto })
  @ApiBadRequestResponse({ description: 'cycleId faltante o inválido' })
  @ApiForbiddenResponse({
    description: 'No es ADMIN ni líder de ese equipo (code REPORT_FORBIDDEN)',
  })
  @ApiNotFoundResponse({ description: 'Equipo o ciclo inexistente' })
  teamReport(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: TeamReportQueryDto,
  ): Promise<TeamReportDto> {
    return this.reports.teamReport(user, id, query.cycleId);
  }
}
