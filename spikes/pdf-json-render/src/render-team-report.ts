import { renderToBuffer } from "@json-render/react-pdf/render";
import { registerFonts } from "./fonts";
import { customRegistry } from "./registry";
import { buildTeamReportSpec } from "./spec";
import type { TeamReportDto } from "./report-types";

export async function renderTeamReportPdf(report: TeamReportDto): Promise<Buffer> {
  registerFonts();
  const bytes = await renderToBuffer(buildTeamReportSpec(report), { registry: customRegistry });
  return Buffer.from(bytes);
}
