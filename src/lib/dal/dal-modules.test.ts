import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCookies } from '../../../test/mocks/next-headers';
import { getCycle, listCycles } from './cycles';
import { getTeamDetail, getTeamTree } from './teams';
import { listUsers } from './users';

const cache = vi.hoisted(() => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock('next/cache', () => cache);
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  cache.cacheTag.mockClear();
  cache.cacheLife.mockClear();
  __setCookies({ okr_at: 'tok' });
});

const requestOf = (i = 0) => fetchMock.mock.calls[i][0] as Request;

describe('DAL de ciclos', () => {
  it('listCycles pide /cycles con Bearer y etiqueta `cycles` (nunca el token)', async () => {
    fetchMock.mockResolvedValue(Response.json([{ id: 'c1' }]));
    expect(await listCycles()).toEqual([{ id: 'c1' }]);
    expect(requestOf().url).toMatch(/\/cycles$/);
    expect(requestOf().headers.get('authorization')).toBe('Bearer tok');
    expect(cache.cacheTag).toHaveBeenCalledWith('cycles');
    expect(JSON.stringify(cache.cacheTag.mock.calls)).not.toContain('tok');
  });

  it('getCycle etiqueta por id y devuelve null ante 404 o id inválido', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await getCycle('c1')).toBeNull();
    expect(cache.cacheTag).toHaveBeenCalledWith('cycles', 'cycle:c1');
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));
    expect(await getCycle('no-uuid')).toBeNull();
  });
});

describe('DAL de equipos y usuarios', () => {
  it('getTeamDetail con ciclo etiqueta el ciclo y los OKRs, y pasa cycleId por query', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 't1', members: [], originMix: null }));
    await getTeamDetail('t1', 'c1');
    expect(requestOf().url).toMatch(/\/teams\/t1\?cycleId=c1$/);
    expect(cache.cacheTag).toHaveBeenCalledWith('teams', 'team:t1');
    expect(cache.cacheTag).toHaveBeenCalledWith('cycle:c1', 'okrs');
  });

  it('getTeamDetail sin ciclo no consulta con cycleId y devuelve null ante 404', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    expect(await getTeamDetail('t1')).toBeNull();
    expect(requestOf().url).not.toContain('cycleId');
  });

  it('getTeamTree y listUsers etiquetan `teams` y `users`', async () => {
    fetchMock.mockImplementation(async () => Response.json([]));
    await getTeamTree();
    await listUsers();
    expect(cache.cacheTag).toHaveBeenCalledWith('teams');
    expect(cache.cacheTag).toHaveBeenCalledWith('users');
  });

  it('un 401 del back redirige a /login', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(listUsers()).rejects.toThrow('NEXT_REDIRECT:/login');
  });
});
