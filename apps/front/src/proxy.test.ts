// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

const fetchMock = vi.fn();

function jwt(expInSeconds: number): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64({ exp: Math.floor(Date.now() / 1000) + expInSeconds })}.s`;
}

function req(path: string, cookies: Record<string, string> = {}) {
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  return new NextRequest(`http://localhost:3001${path}`, { headers: cookie ? { cookie } : {} });
}

const session = () => ({
  accessToken: jwt(900),
  refreshToken: 'rt-nuevo',
  accessExpiresAt: new Date(Date.now() + 900_000).toISOString(),
  refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  user: { id: '1', name: 'Ana', email: 'a@b.c', role: 'MEMBER' },
});

const location = (res: Response) => res.headers.get('location');
const isPassThrough = (res: Response) => res.headers.get('x-middleware-next') === '1';

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('proxy', () => {
  it('deja pasar /login sin chequear nada', async () => {
    expect(isPassThrough(await proxy(req('/login')))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sin cookies redirige a /login?next= con la ruta original', async () => {
    const res = await proxy(req('/okrs?tab=1'));
    expect(location(res)).toBe('http://localhost:3001/login?next=%2Fokrs%3Ftab%3D1');
  });

  it('con access vigente deja pasar sin llamar al back', async () => {
    const res = await proxy(req('/', { okr_at: jwt(600), okr_rt: 'rt' }));
    expect(isPassThrough(res)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sin access pero con refresh: rota ambas cookies y reescribe el Cookie del render', async () => {
    fetchMock.mockResolvedValue(Response.json(session()));
    const res = await proxy(req('/okrs', { okr_rt: 'rt-viejo' }));

    expect(isPassThrough(res)).toBe(true);
    expect(res.cookies.get('okr_at')?.value).toBeTruthy();
    expect(res.cookies.get('okr_rt')?.value).toBe('rt-nuevo');
    expect(res.cookies.get('okr_rt')).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
    expect(res.headers.get('x-middleware-request-cookie')).toContain('okr_rt=rt-nuevo');
  });

  it('renueva si el access vence en menos de 60 s', async () => {
    fetchMock.mockResolvedValue(Response.json(session()));
    await proxy(req('/', { okr_at: jwt(30), okr_rt: 'rt' }));
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('carrera (401) con access vencido: reintenta una vez sin borrar cookies', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    const res = await proxy(req('/okrs', { okr_at: jwt(-5), okr_rt: 'rt' }));

    expect(location(res)).toBe('http://localhost:3001/okrs');
    expect(res.cookies.get('okr_rr')?.value).toBe('1');
    expect(res.cookies.get('okr_rt')).toBeUndefined();
  });

  it('segundo fallo (ya con marca de reintento): borra cookies y va a /login', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    const res = await proxy(req('/okrs', { okr_rt: 'rt', okr_rr: '1' }));

    expect(location(res)).toContain('/login?next=%2Fokrs');
    expect(res.cookies.get('okr_at')?.value).toBe('');
    expect(res.cookies.get('okr_rt')?.value).toBe('');
  });

  it('401 en refresh pero el access aún sirve: deja pasar', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    const res = await proxy(req('/', { okr_at: jwt(30), okr_rt: 'rt' }));
    expect(isPassThrough(res)).toBe(true);
  });

  it('back caído con access vencido: a /login sin borrar la sesión', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const res = await proxy(req('/', { okr_at: jwt(-5), okr_rt: 'rt' }));
    expect(location(res)).toContain('/login');
    expect(res.cookies.get('okr_rt')).toBeUndefined();
  });

  it('sin refresh y access vencido: a /login limpiando cookies', async () => {
    const res = await proxy(req('/', { okr_at: jwt(-5) }));
    expect(location(res)).toBe('http://localhost:3001/login');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
