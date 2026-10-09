import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCookies } from '../../../test/mocks/next-headers';
import {
  getLedTeams,
  getMyObjectives,
  getPendingSummary,
  getRecognitionsSummary,
} from './dashboard';
import { countUnreadFeedback } from './feedback';

vi.mock('next/cache', () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock('next/server', () => ({ connection: vi.fn(async () => undefined) }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

const fetchMock = vi.fn();
const urls = () => fetchMock.mock.calls.map((c) => (c[0] as Request).url);

/** Responde por ruta: `routes['/objectives']` etc. */
function route(routes: Record<string, unknown>) {
  fetchMock.mockImplementation(async (req: Request) => {
    const path = new URL(req.url).pathname;
    return path in routes ? Response.json(routes[path]) : new Response(null, { status: 404 });
  });
}

const user = {
  id: 'u1',
  name: 'Ana',
  role: 'LEADER' as const,
  teams: [
    { teamId: 't2', name: 'Producto', isLead: false },
    { teamId: 't1', name: 'Plataforma', isLead: true },
  ],
};
const obj = (over: Record<string, unknown>) => ({ keyResults: [], ...over });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  __setCookies({ okr_at: 'tok' });
});

describe('DAL del dashboard', () => {
  it('getMyObjectives separa individuales y de equipos a los que pertenezco, ignorando los ajenos', async () => {
    route({
      '/objectives': [
        obj({ id: 'o1', title: 'B mío', ownerUserId: 'u1', ownerTeamId: null }),
        obj({ id: 'o2', title: 'A mío', ownerUserId: 'u1', ownerTeamId: null }),
        obj({ id: 'o3', title: 'De otra persona', ownerUserId: 'u9', ownerTeamId: null }),
        obj({ id: 'o4', title: 'Equipo plataforma', ownerUserId: null, ownerTeamId: 't1' }),
        obj({ id: 'o5', title: 'Equipo ajeno', ownerUserId: null, ownerTeamId: 't9' }),
      ],
    });
    const result = await getMyObjectives(user, 'c1');
    expect(urls()[0]).toMatch(/\/objectives\?cycleId=c1$/);
    expect(result.individual.map((o) => o.id)).toEqual(['o2', 'o1']);
    expect(result.team).toHaveLength(1);
    expect(result.team[0].teamName).toBe('Plataforma');
    expect(result.team[0].objectives.map((o) => o.id)).toEqual(['o4']);
  });

  it('getPendingSummary informa el total y recorta a 5', async () => {
    route({
      '/check-ins/pending': Array.from({ length: 7 }, (_, i) => ({ keyResultId: `k${i}` })),
    });
    const { total, top } = await getPendingSummary();
    expect(total).toBe(7);
    expect(top.map((p) => p.keyResultId)).toEqual(['k0', 'k1', 'k2', 'k3', 'k4']);
  });

  it('getRecognitionsSummary pide 3 míos (toUserId) y 3 del muro, y resuelve nombres sin conteos', async () => {
    const r = (id: string, from: string, to: string) => ({
      id,
      fromUserId: from,
      toUserId: to,
      message: 'm',
      createdAt: '2026-10-01T10:00:00Z',
      objectiveId: null,
      keyResultId: null,
      milestoneVerified: false,
    });
    fetchMock.mockImplementation(async (req: Request) => {
      const url = new URL(req.url);
      if (url.pathname === '/users')
        return Response.json([
          { id: 'u1', name: 'Ana' },
          { id: 'u2', name: 'Beto' },
        ]);
      const mine = url.searchParams.get('toUserId') === 'u1';
      return Response.json({
        items: mine ? [r('r1', 'u2', 'u1')] : [r('r2', 'u1', 'u2')],
        total: 1,
        page: 1,
        limit: 3,
      });
    });
    const result = await getRecognitionsSummary('u1');
    const recognitionUrls = urls().filter((u) => u.includes('/recognitions'));
    expect(recognitionUrls.some((u) => u.includes('toUserId=u1') && u.includes('limit=3'))).toBe(
      true,
    );
    expect(recognitionUrls.some((u) => !u.includes('toUserId') && u.includes('limit=3'))).toBe(
      true,
    );
    expect(result.received[0]).toMatchObject({ fromName: 'Beto', toName: 'Ana' });
    expect(result.wall[0]).toMatchObject({ fromName: 'Ana', toName: 'Beto' });
  });

  it('getLedTeams trae el 50/50 solo de los equipos que lidero', async () => {
    route({
      '/teams/t1': {
        id: 't1',
        name: 'Plataforma',
        members: [],
        parentId: null,
        originMix: { topDown: 2, bottomUp: 2, bottomUpRatio: 0.5, warning: false },
      },
    });
    const led = await getLedTeams(user, 'c1');
    expect(led).toEqual([
      {
        id: 't1',
        name: 'Plataforma',
        originMix: { topDown: 2, bottomUp: 2, bottomUpRatio: 0.5, warning: false },
      },
    ]);
    expect(urls()).toHaveLength(1);
    expect(urls()[0]).toMatch(/\/teams\/t1\?cycleId=c1$/);
  });

  it('countUnreadFeedback cuenta solo lo recibido sin leer y devuelve un número, nunca contenido', async () => {
    route({
      '/feedback': [
        { id: 'f1', content: 'secreto', readAt: null },
        { id: 'f2', content: 'otro', readAt: '2026-10-01T10:00:00Z' },
        { id: 'f3', content: 'tercero', readAt: null },
      ],
    });
    const count = await countUnreadFeedback();
    expect(count).toBe(2);
    expect(urls()[0]).toMatch(/\/feedback\?box=received$/);
  });
});
