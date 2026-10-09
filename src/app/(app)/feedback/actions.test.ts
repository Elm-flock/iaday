import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCookies } from '../../../../test/mocks/next-headers';
import {
  createFeedbackAction,
  deleteFeedbackAction,
  markFeedbackReadAction,
  updateFeedbackAction,
} from './actions';
import { idleState } from '@/lib/actions/form-state';

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), updateTag: vi.fn() }));
vi.mock('next/cache', () => mocks);
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  unstable_rethrow: (e: unknown) => {
    if (e instanceof Error && e.message.startsWith('NEXT_REDIRECT')) throw e;
  },
}));

const fetchMock = vi.fn();
const requestOf = (i = 0) => fetchMock.mock.calls[i][0] as Request;
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  mocks.refresh.mockClear();
  mocks.updateTag.mockClear();
  __setCookies({ okr_at: 'tok' });
});

describe('createFeedbackAction', () => {
  it('no llama al back con datos inválidos', async () => {
    const state = await createFeedbackAction(idleState, form({ toUserId: 'b', content: '' }));
    expect(state.status).toBe('error');
    expect(state.fieldErrors?.content).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envía con Bearer y vuelve a la bandeja de enviados; nada se cachea ni se etiqueta', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'f1' }, { status: 201 }));
    await expect(
      createFeedbackAction(idleState, form({ toUserId: 'b', content: 'Muy buen trabajo' })),
    ).rejects.toThrow('NEXT_REDIRECT:/feedback?box=sent&enviado=1');
    expect(requestOf().method).toBe('POST');
    expect(requestOf().headers.get('authorization')).toBe('Bearer tok');
    expect(await requestOf().json()).toEqual({ toUserId: 'b', content: 'Muy buen trabajo' });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it('autoenvío rechazado por el back: copy claro y conserva lo escrito', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ statusCode: 400, message: 'No podés enviarte feedback' }, { status: 400 }),
    );
    const state = await createFeedbackAction(
      idleState,
      form({ toUserId: 'yo', content: 'Mi mensaje' }),
    );
    expect(state.status).toBe('error');
    expect(state.message).toMatch(/no sea para vos mismo/);
    expect(state.values?.content).toBe('Mi mensaje');
  });

  it('un 404 del back se explica sin revelar nada más', async () => {
    fetchMock.mockResolvedValue(Response.json({ statusCode: 404, message: 'x' }, { status: 404 }));
    const state = await createFeedbackAction(idleState, form({ toUserId: 'z', content: 'hola' }));
    expect(state.message).toMatch(/No encontramos/);
  });
});

describe('updateFeedbackAction', () => {
  it('edita con PATCH y refresca el router (sin updateTag)', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'f1' }));
    const state = await updateFeedbackAction('f1', idleState, form({ content: 'Editado' }));
    expect(state.status).toBe('success');
    expect(requestOf().url).toMatch(/\/feedback\/f1$/);
    expect(requestOf().method).toBe('PATCH');
    expect(mocks.refresh).toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it('403 si no es el autor', async () => {
    fetchMock.mockResolvedValue(Response.json({ statusCode: 403, message: 'x' }, { status: 403 }));
    const state = await updateFeedbackAction('f1', idleState, form({ content: 'Editado' }));
    expect(state.message).toMatch(/Solo quien escribió/);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe('deleteFeedbackAction', () => {
  it('borra y redirige a la bandeja de enviados', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteFeedbackAction('f1')).rejects.toThrow(
      'NEXT_REDIRECT:/feedback?box=sent&eliminado=1',
    );
    expect(requestOf().method).toBe('DELETE');
  });

  it('un error devuelve el mensaje y no redirige', async () => {
    fetchMock.mockResolvedValue(Response.json({ statusCode: 404, message: 'x' }, { status: 404 }));
    const state = await deleteFeedbackAction('f1');
    expect(state.status).toBe('error');
  });
});

describe('markFeedbackReadAction', () => {
  it('PATCH /feedback/:id/read', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'f1', readAt: '2026-01-01T00:00:00Z' }));
    const state = await markFeedbackReadAction('f1');
    expect(state.status).toBe('success');
    expect(requestOf().url).toMatch(/\/feedback\/f1\/read$/);
    expect(requestOf().method).toBe('PATCH');
  });
});
