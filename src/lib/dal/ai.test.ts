import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCookies } from '../../../test/mocks/next-headers';
import { getAiImpact, getAiStatus, getAiUsage, parseRangeDays } from './ai';

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
  __setCookies({ okr_at: 'tok' });
});

describe('getAiStatus', () => {
  it('enabled=true: usa Bearer y consulta /ai/status', async () => {
    fetchMock.mockResolvedValue(Response.json({ enabled: true }));
    expect(await getAiStatus()).toEqual({ enabled: true });
    expect(requestOf().url).toMatch(/\/ai\/status$/);
    expect(requestOf().headers.get('authorization')).toBe('Bearer tok');
  });

  it('enabled=false cuando el back lo informa', async () => {
    fetchMock.mockResolvedValue(Response.json({ enabled: false }));
    expect(await getAiStatus()).toEqual({ enabled: false });
  });

  it('degrada a "no disponible" ante 5xx: la IA nunca rompe la página', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    expect(await getAiStatus()).toEqual({ enabled: false });
  });

  it('degrada a "no disponible" si la API no responde', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    expect(await getAiStatus()).toEqual({ enabled: false });
  });

  it('el 401 sigue redirigiendo al login (no se traga)', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(getAiStatus()).rejects.toThrow('NEXT_REDIRECT:/login');
  });
});

describe('parseRangeDays', () => {
  it('acepta 7, 30 y 90 y cae en 30 con cualquier otra cosa', () => {
    expect(parseRangeDays('7')).toBe(7);
    expect(parseRangeDays(['90'])).toBe(90);
    expect(parseRangeDays('30')).toBe(30);
    expect(parseRangeDays('15')).toBe(30);
    expect(parseRangeDays(undefined)).toBe(30);
    expect(parseRangeDays('abc')).toBe(30);
  });
});

describe('getAiUsage / getAiImpact', () => {
  it('piden el rango como `from` ISO de los últimos N días y no usan cache', async () => {
    fetchMock.mockResolvedValue(Response.json({ byFeature: [], byModel: [], failures: [] }));
    const before = Date.now();
    await getAiUsage(7);
    const from = new URL(requestOf().url).searchParams.get('from') ?? '';
    const delta = before - new Date(from).getTime();
    expect(delta).toBeGreaterThanOrEqual(7 * 86_400_000 - 5_000);
    expect(delta).toBeLessThanOrEqual(7 * 86_400_000 + 5_000);
    expect(requestOf().url).toMatch(/\/ai\/usage\?/);
    expect(requestOf().headers.get('authorization')).toBe('Bearer tok');
  });

  it('impacto: mismo contrato con /ai/impact', async () => {
    fetchMock.mockResolvedValue(Response.json({ adoption: {} }));
    expect(await getAiImpact(30)).toEqual({ adoption: {} });
    expect(requestOf().url).toMatch(/\/ai\/impact\?from=/);
  });

  it('un 403 (no ADMIN) se propaga como error: la página lo trata antes con notFound', async () => {
    fetchMock.mockResolvedValue(Response.json({ statusCode: 403 }, { status: 403 }));
    await expect(getAiUsage()).rejects.toMatchObject({ status: 403 });
  });
});

describe('privacidad del DAL de IA', () => {
  it('no usa ninguna cache de Next (las adaptaciones de feedback son privadas) ni console.*', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/dal/ai.ts'), 'utf8');
    const code = source
      .split(/\r?\n/)
      .filter((line) => !/^\s*(\/\*|\*|\/\/)/.test(line))
      .join('\n');
    expect(code).not.toMatch(/use cache/);
    expect(code).not.toMatch(/unstable_cache|cacheTag|cacheLife/);
    expect(code).not.toMatch(/console\./);
  });
});
