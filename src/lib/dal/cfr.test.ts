import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCookies } from '../../../test/mocks/next-headers';
import { getFeedback, listFeedback } from './feedback';
import { listRecognitions } from './recognitions';

const cache = vi.hoisted(() => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock('next/cache', () => cache);
vi.mock('next/server', () => ({ connection: async () => {} }));
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
  cache.cacheLife.mockClear();
  __setCookies({ okr_at: 'tok' });
});

describe('DAL de feedback (privado, sin cache)', () => {
  it('listFeedback pide la bandeja con Bearer y NO usa ninguna cache', async () => {
    fetchMock.mockResolvedValue(Response.json([{ id: 'f1' }]));
    expect(await listFeedback('received')).toEqual([{ id: 'f1' }]);
    expect(requestOf().url).toMatch(/\/feedback\?box=received$/);
    expect(requestOf().headers.get('authorization')).toBe('Bearer tok');
    expect(cache.cacheTag).not.toHaveBeenCalled();
    expect(cache.cacheLife).not.toHaveBeenCalled();
  });

  it('getFeedback devuelve null ante 404 (ajeno = inexistente) o id inválido', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await getFeedback('f1')).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));
    expect(await getFeedback('x')).toBeNull();
    expect(requestOf().url).toMatch(/\/feedback\/f1$/);
    expect(cache.cacheTag).not.toHaveBeenCalled();
  });

  it('el módulo no declara directivas de cache ni loguea (guarda contra regresiones)', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/dal/feedback.ts'), 'utf8');
    // Ignora los comentarios que explican la regla.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/use cache|unstable_cache|cacheTag|cacheLife/);
    expect(code).not.toMatch(/console\./);
  });
});

describe('DAL de reconocimientos (muro público)', () => {
  it('pagina, filtra por persona y etiqueta `recognitions` (nunca el token)', async () => {
    fetchMock.mockResolvedValue(Response.json({ items: [], total: 0, page: 2, limit: 10 }));
    await listRecognitions(2, 'ana');
    expect(requestOf().url).toMatch(/\/recognitions\?page=2&limit=10&toUserId=ana$/);
    expect(cache.cacheTag).toHaveBeenCalledWith('recognitions');
    expect(JSON.stringify(cache.cacheTag.mock.calls)).not.toContain('tok');
  });

  it('sin persona no manda toUserId', async () => {
    fetchMock.mockResolvedValue(Response.json({ items: [], total: 0, page: 1, limit: 10 }));
    await listRecognitions(1);
    expect(requestOf().url).not.toMatch(/toUserId/);
  });
});
