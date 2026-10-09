import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
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
      'Reporte del equipo en un ciclo (cualquier autenticado): objetivos del equipo y objetivos individuales de sus miembros agrupados por persona, con KRs, scores, bandas, mezcla de origen y logro al cierre. Sin feedback, ranking ni datos de compensación.',
  })
  @ApiOkResponse({ type: TeamReportDto })
  @ApiBadRequestResponse({ description: 'cycleId faltante o inválido' })
  @ApiNotFoundResponse({ description: 'Equipo o ciclo inexistente' })
  teamReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: TeamReportQueryDto,
  ): Promise<TeamReportDto> {
    return this.reports.teamReport(id, query.cycleId);
  }
}
