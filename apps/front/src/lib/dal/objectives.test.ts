import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCookies } from '../../../test/mocks/next-headers';
import { getObjective, listObjectives } from './objectives';

const cache = vi.hoisted(() => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock('next/cache', () => cache);
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

const fetchMock = vi.fn();
const requestOf = (i = 0) => fetchMock.mock.calls[i][0] as Request;

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  cache.cacheTag.mockClear();
  __setCookies({ okr_at: 'tok' });
});

describe('DAL de objetivos', () => {
  it('listObjectives pasa los filtros por query, usa Bearer y etiqueta `okrs` (nunca el token)', async () => {
    fetchMock.mockResolvedValue(Response.json([{ id: 'o1' }]));
    expect(await listObjectives({ cycleId: 'c1', status: 'PUBLISHED' })).toEqual([{ id: 'o1' }]);
    expect(requestOf().url).toMatch(/\/objectives\?cycleId=c1&status=PUBLISHED$/);
    expect(requestOf().headers.get('authorization')).toBe('Bearer tok');
    expect(cache.cacheTag).toHaveBeenCalledWith('okrs');
    expect(JSON.stringify(cache.cacheTag.mock.calls)).not.toContain('tok');
  });

  it('getObjective etiqueta por id y devuelve null ante 404 (DRAFT ajeno) o id inválido', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await getObjective('o1')).toBeNull();
    expect(cache.cacheTag).toHaveBeenCalledWith('okrs', 'objective:o1');
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));
    expect(await getObjective('no-uuid')).toBeNull();
  });

  it('getObjective devuelve el objetivo con sus KRs', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'o1', keyResults: [{ id: 'k1' }] }));
    expect((await getObjective('o1'))?.keyResults).toHaveLength(1);
  });
});
