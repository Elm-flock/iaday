import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCookies } from '../../../../test/mocks/next-headers';
import { createAdaptationRequestAction } from './actions';
import {
  assignRequestAction,
  deliverRequestAction,
  rejectRequestAction,
} from '../admin/pedidos-adaptacion/actions';
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
const ID = '6f1c2f0e-3b8d-4a52-9c5e-1d2a3b4c5d6e';

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  mocks.refresh.mockClear();
  mocks.updateTag.mockClear();
  __setCookies({ okr_at: 'tok' });
});

describe('createAdaptationRequestAction', () => {
  it('no llama al back con datos inválidos', async () => {
    const state = await createAdaptationRequestAction(idleState, form({ subject: '' }));
    expect(state.status).toBe('error');
    expect(state.fieldErrors?.subject).toBeDefined();
    expect(state.fieldErrors?.preferredFormat).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('crea con Bearer, vincula y vuelve a "Mis pedidos"; nada se cachea', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'r1' }, { status: 201 }));
    await expect(
      createAdaptationRequestAction(
        idleState,
        form({
          subject: 'Manual en audio',
          preferredFormat: 'AUDIO',
          linkType: 'feedback',
          linkId: ID,
        }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT:/pedidos-adaptacion?creado=1');
    expect(requestOf().url).toMatch(/\/adaptation-requests$/);
    expect(requestOf().method).toBe('POST');
    expect(requestOf().headers.get('authorization')).toBe('Bearer tok');
    expect(await requestOf().json()).toEqual({
      subject: 'Manual en audio',
      preferredFormat: 'AUDIO',
      entityType: 'FEEDBACK',
      entityId: ID,
    });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it('un 404 (feedback ajeno o inexistente) se explica sin revelar nada y conserva lo escrito', async () => {
    fetchMock.mockResolvedValue(Response.json({ statusCode: 404, message: 'x' }, { status: 404 }));
    const state = await createAdaptationRequestAction(
      idleState,
      form({ subject: 'Manual', preferredFormat: 'AUDIO', linkType: 'feedback', linkId: ID }),
    );
    expect(state.status).toBe('error');
    expect(state.message).toMatch(/No encontramos el elemento que quisiste vincular/);
    expect(state.values?.subject).toBe('Manual');
  });
});

describe('acciones de administración', () => {
  it('asignar: PATCH con el id y refresca', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'r1' }));
    const state = await assignRequestAction('r1', idleState, form({ assigneeId: ID }));
    expect(state.status).toBe('success');
    expect(requestOf().url).toMatch(/\/adaptation-requests\/r1\/assign$/);
    expect(requestOf().method).toBe('PATCH');
    expect(await requestOf().json()).toEqual({ assigneeId: ID });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('entregar: nota corta no llega al back; con nota y enlace sí', async () => {
    const bad = await deliverRequestAction('r1', idleState, form({ resolutionNote: 'corta' }));
    expect(bad.status).toBe('error');
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(Response.json({ id: 'r1' }));
    const ok = await deliverRequestAction(
      'r1',
      idleState,
      form({ resolutionNote: 'Te lo dejamos en el drive', resolutionLink: 'https://x.test/doc' }),
    );
    expect(ok.status).toBe('success');
    expect(requestOf().url).toMatch(/\/adaptation-requests\/r1\/deliver$/);
    expect(await requestOf().json()).toEqual({
      resolutionNote: 'Te lo dejamos en el drive',
      resolutionLink: 'https://x.test/doc',
    });
  });

  it('rechazar SIN justificación: error de campo y NO se llama al back', async () => {
    const state = await rejectRequestAction('r1', idleState, form({ justification: '' }));
    expect(state.status).toBe('error');
    expect(state.fieldErrors?.justification).toMatch(/justificación por escrito/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('rechazar: si el back responde 422 por la justificación, muestra el copy claro', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        {
          statusCode: 422,
          message: 'x',
          code: 'ADAPTATION_REJECTION_JUSTIFICATION_REQUIRED',
        },
        { status: 422 },
      ),
    );
    const state = await rejectRequestAction(
      'r1',
      idleState,
      form({ justification: 'Hoy no podemos hacerlo porque es muy costoso.' }),
    );
    expect(state.status).toBe('error');
    expect(state.message).toMatch(/justificación por escrito/);
    expect(state.values?.justification).toMatch(/muy costoso/);
  });

  it('rechazar con justificación: POST y refresco', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'r1' }));
    const text = 'Hoy no podemos hacerlo porque exige un estudio externo.';
    const state = await rejectRequestAction('r1', idleState, form({ justification: text }));
    expect(state.status).toBe('success');
    expect(requestOf().url).toMatch(/\/adaptation-requests\/r1\/reject$/);
    expect(await requestOf().json()).toEqual({ justification: text });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('un pedido ya resuelto (409) se explica', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { statusCode: 409, message: 'x', code: 'ADAPTATION_REQUEST_STATE_CONFLICT' },
        { status: 409 },
      ),
    );
    const state = await deliverRequestAction(
      'r1',
      idleState,
      form({ resolutionNote: 'Te lo dejamos en el drive' }),
    );
    expect(state.message).toMatch(/ya fue resuelto/);
  });
});
