import type { components } from '@/lib/api/schema';

/** Contrato del back `GET /reports/teams/:id?cycleId=`. Nunca incluye feedback, ranking ni compensación. */
export type TeamReportDto = components['schemas']['TeamReportDto'];
export type ReportObjectiveDto = components['schemas']['ReportObjectiveDto'];
export type ReportKeyResultDto = components['schemas']['ReportKeyResultDto'];
export type Band = ReportObjectiveDto['band'];
