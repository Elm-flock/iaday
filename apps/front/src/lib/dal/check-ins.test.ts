import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCookies } from '../../../test/mocks/next-headers';
import { listKrCheckIns, listPendingCheckIns } from './check-ins';

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

describe('DAL de check-ins', () => {
  it('listPendingCheckIns usa Bearer, etiqueta `check-ins:pending` y nunca el token', async () => {
    fetchMock.mockResolvedValue(Response.json([{ keyResultId: 'k1' }]));
    expect(await listPendingCheckIns()).toEqual([{ keyResultId: 'k1' }]);
    expect(requestOf().url).toMatch(/\/check-ins\/pending$/);
    expect(requestOf().headers.get('authorization')).toBe('Bearer tok');
    expect(cache.cacheTag).toHaveBeenCalledWith('check-ins:pending');
    expect(JSON.stringify(cache.cacheTag.mock.calls)).not.toContain('tok');
  });

  it('listKrCheckIns etiqueta por KR y devuelve [] ante 404 o id inválido', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await listKrCheckIns('k1')).toEqual([]);
    expect(cache.cacheTag).toHaveBeenCalledWith('okrs', 'kr:k1');
    expect(requestOf().url).toMatch(/\/key-results\/k1\/check-ins$/);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));
    expect(await listKrCheckIns('x')).toEqual([]);
  });

  it('listKrCheckIns devuelve el historial', async () => {
    fetchMock.mockResolvedValue(Response.json([{ id: 'c1' }, { id: 'c2' }]));
    expect(await listKrCheckIns('k1')).toHaveLength(2);
  });
});
