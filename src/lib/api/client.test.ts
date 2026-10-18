import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCookies } from '../../../test/mocks/next-headers';
import { authedApi } from './client';

const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);
vi.mock('next/navigation', () => ({ redirect }));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  redirect.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('authedApi', () => {
  it('redirige a /login si no hay cookie de acceso', async () => {
    __setCookies({});
    await expect(authedApi()).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envía el Bearer tomado de la cookie', async () => {
    __setCookies({ okr_at: 'tok123' });
    fetchMock.mockResolvedValue(
      Response.json({ id: '1', name: 'Ana', email: 'a@b.c', role: 'MEMBER', teams: [] }),
    );

    const client = await authedApi();
    const { data } = await client.GET('/auth/me');

    expect(data?.name).toBe('Ana');
    const request = fetchMock.mock.calls[0][0] as Request;
    expect(request.headers.get('authorization')).toBe('Bearer tok123');
  });

  it('redirige a /login ante un 401 de Nest', async () => {
    __setCookies({ okr_at: 'vencido' });
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    const client = await authedApi();
    await expect(client.GET('/auth/me')).rejects.toThrow('NEXT_REDIRECT:/login');
  });
});

describe('authedApi: cambio de contraseña obligatorio', () => {
  it('redirige a /cambiar-contrasena ante 403 PASSWORD_CHANGE_REQUIRED', async () => {
    __setCookies({ okr_at: 'tok' });
    fetchMock.mockResolvedValue(
      Response.json(
        {
          statusCode: 403,
          message: 'Tenés que cambiar la contraseña',
          code: 'PASSWORD_CHANGE_REQUIRED',
        },
        { status: 403 },
      ),
    );
    const client = await authedApi();
    await expect(client.GET('/objectives')).rejects.toThrow('NEXT_REDIRECT:/cambiar-contrasena');
  });

  it('un 403 de permisos común NO redirige', async () => {
    __setCookies({ okr_at: 'tok' });
    fetchMock.mockResolvedValue(
      Response.json({ statusCode: 403, message: 'Prohibido' }, { status: 403 }),
    );
    const client = await authedApi();
    const result = await client.GET('/objectives');
    expect(result.response.status).toBe(403);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('un 403 sin cuerpo JSON tampoco redirige', async () => {
    __setCookies({ okr_at: 'tok' });
    fetchMock.mockResolvedValue(new Response('no es json', { status: 403 }));
    const client = await authedApi();
    const result = await client.GET('/objectives');
    expect(result.response.status).toBe(403);
    expect(redirect).not.toHaveBeenCalled();
  });
});
