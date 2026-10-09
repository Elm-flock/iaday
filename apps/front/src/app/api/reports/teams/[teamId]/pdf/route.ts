import { cookies } from 'next/headers';
import { createApiClient } from '@/lib/api/create-client';
import { ACCESS_COOKIE } from '@/lib/auth/constants';
import { renderTeamReportPdf } from '@/lib/pdf/render-team-report-pdf';
import { teamReportFilename } from '@/lib/pdf/slug';

// SIN `export const runtime`: con cacheComponents es un error de build/dev (Node es el default).
// Descarga de archivo: se responde 401 (no redirect a /login) y todo va con `no-store`.

const NO_STORE = { 'Cache-Control': 'no-store' };

function problem(status: number, message: string): Response {
  return Response.json({ message }, { status, headers: NO_STORE });
}

/**
 * GET /api/reports/teams/:teamId/pdf?cycleId=
 * Lee la sesión de la cookie httpOnly en el server, pide el reporte al back con el Bearer y lo
 * convierte a PDF. El token nunca llega al browser ni a una función cacheada. Sin feedback.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
): Promise<Response> {
  const { teamId } = await params;
  const cycleId = new URL(request.url).searchParams.get('cycleId');
  if (!cycleId) return problem(400, 'Falta el ciclo (cycleId).');

  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return problem(401, 'Iniciá sesión para descargar el reporte.');

  let result: Awaited<ReturnType<ReturnType<typeof createApiClient>['GET']>>;
  try {
    result = await createApiClient({ token }).GET('/reports/teams/{id}', {
      params: { path: { id: teamId }, query: { cycleId } },
    });
  } catch {
    return problem(502, 'No pudimos conectar con el servidor. Probá de nuevo en un momento.');
  }

  const { data, response } = result;
  if (response.status === 401) return problem(401, 'Tu sesión venció. Volvé a iniciar sesión.');
  if (response.status === 404) return problem(404, 'No encontramos el equipo o el ciclo.');
  if (response.status === 400) return problem(400, 'El equipo o el ciclo no son válidos.');
  if (!response.ok || !data)
    return problem(response.status === 403 ? 403 : 502, 'No pudimos generar el reporte.');

  let pdf: Buffer;
  try {
    pdf = await renderTeamReportPdf(data);
  } catch {
    return problem(500, 'No pudimos generar el PDF. Probá de nuevo.');
  }

  return new Response(new Uint8Array(pdf), {
    headers: {
      ...NO_STORE,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${teamReportFilename(data.team.name, data.cycle.name)}"`,
    },
  });
}
