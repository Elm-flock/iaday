// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNextHeaders, __setCookies } from '../../../../../../../test/mocks/next-headers';
import { GET } from './route';
import { report } from '@/lib/pdf/fixtures';

const render = vi.hoisted(() => vi.fn());
vi.mock('@/lib/pdf/render-team-report-pdf', () => ({ renderTeamReportPdf: render }));

const fetchMock = vi.fn();
const TEAM = '11111111-1111-4111-8111-111111111111';
const CYCLE = '22222222-2222-4222-8222-222222222222';
const call = (query = `?cycleId=${CYCLE}`) =>
  GET(new Request(`http://localhost/api/reports/teams/${TEAM}/pdf${query}`), {
    params: Promise.resolve({ teamId: TEAM }),
  });

function backResponds(status: number, body?: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  render.mockResolvedValue(Buffer.from('%PDF-1.3 fake'));
  __setCookies({ okr_at: 'tok-123' });
});
afterEach(() => {
  fetchMock.mockReset();
  render.mockReset();
  __resetNextHeaders();
  vi.unstubAllGlobals();
});

describe('GET /api/reports/teams/:teamId/pdf', () => {
  it('400 si falta cycleId, sin llamar al back', async () => {
    const res = await call('');
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('401 sin sesión (no redirige), sin llamar al back', async () => {
    __setCookies({});
    const res = await call();
    expect(res.status).toBe(401);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('200: PDF como adjunto, no-store, con el Bearer de la cookie y nombre con slugs', async () => {
    backResponds(200, report());
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="reporte-plataforma-nucleo-q1-2026.pdf"',
    );
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(Buffer.from(await res.arrayBuffer()).toString('latin1')).toMatch(/^%PDF/);

    const request = fetchMock.mock.calls[0][0] as Request;
    expect(new URL(request.url).pathname).toBe(`/reports/teams/${TEAM}`);
    expect(new URL(request.url).searchParams.get('cycleId')).toBe(CYCLE);
    expect(request.headers.get('authorization')).toBe('Bearer tok-123');
    expect(render).toHaveBeenCalledOnce();
  });

  it('pasa los 404 y 400 del back', async () => {
    backResponds(404, { message: 'Equipo no encontrado' });
    expect((await call()).status).toBe(404);
    backResponds(400, { message: 'cycleId inválido' });
    expect((await call()).status).toBe(400);
    expect(render).not.toHaveBeenCalled();
  });

  it('401 del back (sesión vencida) también es 401, no un redirect', async () => {
    backResponds(401, { message: 'Unauthorized' });
    const res = await call();
    expect(res.status).toBe(401);
    expect(res.headers.get('location')).toBeNull();
  });

  it('502 si el back no responde y 500 si falla el render', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect((await call()).status).toBe(502);
    backResponds(200, report());
    render.mockRejectedValueOnce(new Error('boom'));
    expect((await call()).status).toBe(500);
  });
});
