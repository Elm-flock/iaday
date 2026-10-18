import { cookies } from 'next/headers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCookies } from '../../../test/mocks/next-headers';
import { changePasswordAction, loginAction, logoutAction } from './actions';
import { LOGIN_MESSAGES } from './messages';

const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);
vi.mock('next/navigation', () => ({ redirect, unstable_rethrow: vi.fn() }));
const updateTag = vi.hoisted(() => vi.fn());
vi.mock('next/cache', () => ({ updateTag }));

const fetchMock = vi.fn();

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

const session = () => ({
  accessToken: 'at',
  refreshToken: 'rt',
  accessExpiresAt: new Date(Date.now() + 900_000).toISOString(),
  refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  user: { id: '1', name: 'Ana', email: 'a@b.c', role: 'MEMBER' },
});

beforeEach(() => {
  updateTag.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  redirect.mockClear();
  __setCookies({});
});

describe('loginAction', () => {
  it('pide completar los campos sin llamar al back', async () => {
    const state = await loginAction({}, form({ email: 'a@b.c', password: '' }));
    expect(state.message).toBe(LOGIN_MESSAGES.empty);
    expect(state.email).toBe('a@b.c');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('usa el mismo mensaje para cualquier 401 y conserva el email', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    const state = await loginAction({}, form({ email: 'x@y.z', password: 'mala' }));
    expect(state).toEqual({ message: LOGIN_MESSAGES.invalid, email: 'x@y.z' });
    expect(LOGIN_MESSAGES.invalid).toBe(
      'No pudimos iniciar sesión. Revisá el email y la contraseña.',
    );
  });

  it('informa el 429', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 429 }));
    const state = await loginAction({}, form({ email: 'x@y.z', password: 'p' }));
    expect(state.message).toBe('Hiciste demasiados intentos. Esperá un minuto y probá de nuevo.');
  });

  it('informa si el back no responde', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const state = await loginAction({}, form({ email: 'x@y.z', password: 'p' }));
    expect(state.message).toBe(LOGIN_MESSAGES.unavailable);
  });

  it('setea las cookies y redirige a la ruta `next` válida', async () => {
    fetchMock.mockResolvedValue(Response.json(session()));
    await expect(
      loginAction({}, form({ email: 'a@b.c', password: 'ok', next: '/okrs' })),
    ).rejects.toThrow('NEXT_REDIRECT:/okrs');

    const store = await cookies();
    expect(store.get('okr_at')?.value).toBe('at');
    expect(store.get('okr_rt')?.value).toBe('rt');
  });

  it('ignora un `next` externo (open redirect)', async () => {
    fetchMock.mockResolvedValue(Response.json(session()));
    await expect(
      loginAction({}, form({ email: 'a@b.c', password: 'ok', next: 'https://evil.com' })),
    ).rejects.toThrow('NEXT_REDIRECT:/');
  });
});

describe('loginAction con contraseña inicial', () => {
  const forced = () => ({ ...session(), user: { ...session().user, mustChangePassword: true } });

  it('si mustChangePassword, va a la pantalla de cambio (y conserva el destino)', async () => {
    fetchMock.mockResolvedValue(Response.json(forced()));
    await expect(
      loginAction({}, form({ email: 'a@b.c', password: 'inicial', next: '/okrs' })),
    ).rejects.toThrow('NEXT_REDIRECT:/cambiar-contrasena?next=%2Fokrs');
    expect((await cookies()).get('okr_at')?.value).toBe('at');
  });

  it('sin destino va directo a /cambiar-contrasena', async () => {
    fetchMock.mockResolvedValue(Response.json(forced()));
    await expect(loginAction({}, form({ email: 'a@b.c', password: 'inicial' }))).rejects.toThrow(
      'NEXT_REDIRECT:/cambiar-contrasena',
    );
  });
});

describe('changePasswordAction', () => {
  const valid = {
    currentPassword: 'Inicial-Pass-123!',
    newPassword: 'Una-frase-larga-segura-1',
    confirmPassword: 'Una-frase-larga-segura-1',
  };

  it('valida antes de llamar al back y NO devuelve contraseñas en los valores', async () => {
    __setCookies({ okr_at: 'at' });
    const state = await changePasswordAction(
      { status: 'idle' },
      form({ ...valid, newPassword: 'corta', confirmPassword: 'corta', next: '/' }),
    );
    expect(state.status).toBe('error');
    expect(state.fieldErrors?.newPassword).toMatch(/entre 12 y 200/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(state)).not.toContain('Inicial-Pass');
    expect(state.values).toEqual({ next: '/' });
  });

  it('éxito: reemplaza las cookies con la sesión nueva, invalida "me" y redirige a next', async () => {
    __setCookies({ okr_at: 'viejo', okr_rt: 'viejo' });
    fetchMock.mockResolvedValue(Response.json(session()));
    await expect(
      changePasswordAction({ status: 'idle' }, form({ ...valid, next: '/objetivos' })),
    ).rejects.toThrow('NEXT_REDIRECT:/objetivos');

    const request = fetchMock.mock.calls[0][0] as Request;
    expect(new URL(request.url).pathname).toBe('/auth/change-password');
    expect(request.headers.get('authorization')).toBe('Bearer viejo');
    expect(await request.json()).toEqual({
      currentPassword: valid.currentPassword,
      newPassword: valid.newPassword,
    });
    const store = await cookies();
    expect(store.get('okr_at')?.value).toBe('at');
    expect(store.get('okr_rt')?.value).toBe('rt');
    expect(updateTag).toHaveBeenCalledWith('me');
  });

  it('ignora un next externo', async () => {
    __setCookies({ okr_at: 'viejo' });
    fetchMock.mockResolvedValue(Response.json(session()));
    await expect(
      changePasswordAction({ status: 'idle' }, form({ ...valid, next: 'https://evil.com' })),
    ).rejects.toThrow('NEXT_REDIRECT:/');
  });

  it.each([
    ['INVALID_CURRENT_PASSWORD', /contraseña actual no es correcta/],
    ['PASSWORD_UNCHANGED', /distinta de la actual/],
    ['PASSWORD_TOO_SHORT', /al menos 12/],
  ])('mapea el 422 %s a un mensaje claro y no toca las cookies', async (code, message) => {
    __setCookies({ okr_at: 'viejo', okr_rt: 'rt0' });
    fetchMock.mockResolvedValue(
      Response.json({ statusCode: 422, message: 'x', code }, { status: 422 }),
    );
    const state = await changePasswordAction({ status: 'idle' }, form({ ...valid, next: '/' }));
    expect(state.status).toBe('error');
    expect(state.message).toMatch(message);
    expect((await cookies()).get('okr_at')?.value).toBe('viejo');
    expect(updateTag).not.toHaveBeenCalled();
  });

  it('back caído: aviso de conexión', async () => {
    __setCookies({ okr_at: 'viejo' });
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const state = await changePasswordAction({ status: 'idle' }, form({ ...valid, next: '/' }));
    expect(state.message).toMatch(/conectarnos/);
  });
});

describe('logoutAction', () => {
  it('revoca el refresh en el back, borra las cookies y redirige', async () => {
    __setCookies({ okr_at: 'at', okr_rt: 'rt' });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(logoutAction()).rejects.toThrow('NEXT_REDIRECT:/login');

    const request = fetchMock.mock.calls[0][0] as Request;
    expect(new URL(request.url).pathname).toBe('/auth/logout');
    const store = await cookies();
    expect(store.has('okr_at')).toBe(false);
    expect(store.has('okr_rt')).toBe(false);
  });

  it('borra las cookies aunque el back falle', async () => {
    __setCookies({ okr_rt: 'rt' });
    fetchMock.mockRejectedValue(new Error('caído'));
    await expect(logoutAction()).rejects.toThrow('NEXT_REDIRECT:/login');
    expect((await cookies()).has('okr_rt')).toBe(false);
  });
});
