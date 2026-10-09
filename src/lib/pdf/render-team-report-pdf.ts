import { renderToBuffer } from '@json-render/react-pdf/render';
import { registerPdfFonts } from './fonts';
import { pdfRegistry } from './registry';
import type { TeamReportDto } from './report-types';
import { buildTeamReportSpec } from './team-report-spec';

/**
 * Adaptador: ÚNICO archivo que importa el render de @json-render/react-pdf. Cambiar de motor
 * (p. ej. a @react-pdf/renderer plano) toca solo este archivo; la firma se mantiene.
 */
export async function renderTeamReportPdf(report: TeamReportDto): Promise<Buffer> {
  registerPdfFonts();
  const bytes = await renderToBuffer(buildTeamReportSpec(report), { registry: pdfRegistry });
  return Buffer.from(bytes);
}
