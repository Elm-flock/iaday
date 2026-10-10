import { renderTeamReportPdf } from "@/render-team-report";
import { sampleReport } from "@/fixture";

export async function GET(req: Request) {
  const big = new URL(req.url).searchParams.get("big") === "1";
  const pdf = await renderTeamReportPdf(big ? sampleReport(8, 3, 3) : sampleReport(3, 2, 3));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="reporte-equipo.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
