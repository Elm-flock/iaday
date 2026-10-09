import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCookies } from '../../../../test/mocks/next-headers';
import {
  createKeyResultAction,
  createObjectiveAction,
  deleteObjectiveAction,
  publishObjectiveAction,
  updateKeyResultAction,
} from './actions';
import { idleState } from '@/lib/actions/form-state';

const mocks = vi.hoisted(() => ({
  updateTag: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock('next/cache', () => ({ updateTag: mocks.updateTag }));
vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  unstable_rethrow: (e: unknown) => {
    if (e instanceof Error && e.message.startsWith('NEXT_REDIRECT')) throw e;
  },
}));

const fetchMock = vi.fn();
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const failure = (status: number, code: string) =>
  Response.json({ statusCode: status, code, message: 'x' }, { status });

const objective = {
  cycleId: 'c1',
  owner: 'user:u1',
  title: 'Mejorar la entrega',
  type: 'COMMITTED',
  origin: 'TOP_DOWN',
};

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  mocks.updateTag.mockClear();
  __setCookies({ okr_at: 'tok' });
});

describe('createObjectiveAction', () => {
  it('no llama al back con el formulario inválido', async () => {
    const state = await createObjectiveAction(idleState, form({ ...objective, origin: '' }));
    expect(state.status).toBe('error');
    expect(state.fieldErrors?.origin).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('crea con Bearer, invalida `okrs` y redirige al detalle', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'o1' }, { status: 201 }));
    await expect(createObjectiveAction(idleState, form(objective))).rejects.toThrow(
      'NEXT_REDIRECT:/objetivos/o1',
    );
    const request = fetchMock.mock.calls[0][0] as Request;
    expect(request.headers.get('authorization')).toBe('Bearer tok');
    expect(await request.json()).toMatchObject({ ownerUserId: 'u1', origin: 'TOP_DOWN' });
    expect(mocks.updateTag).toHaveBeenCalledWith('okrs');
  });

  it('el 6.º objetivo (422 OBJECTIVE_LIMIT_EXCEEDED) se explica en español y conserva lo tipeado', async () => {
    fetchMock.mockResolvedValue(failure(422, 'OBJECTIVE_LIMIT_EXCEEDED'));
    const state = await createObjectiveAction(idleState, form(objective));
    expect(state.status).toBe('error');
    expect(state.message).toMatch(/5 objetivos/);
    expect(state.values?.title).toBe('Mejorar la entrega');
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });
});

describe('publishObjectiveAction', () => {
  it('publica e invalida lista y detalle', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'o1' }, { status: 201 }));
    const state = await publishObjectiveAction('o1');
    expect(state.status).toBe('success');
    expect(mocks.updateTag).toHaveBeenCalledWith('okrs');
    expect(mocks.updateTag).toHaveBeenCalledWith('objective:o1');
  });

  it('con menos de 3 KRs muestra el copy de MIN_KRS_NOT_MET', async () => {
    fetchMock.mockResolvedValue(failure(422, 'MIN_KRS_NOT_MET'));
    const state = await publishObjectiveAction('o1');
    expect(state.message).toMatch(/al menos 3 resultados clave/);
  });
});

describe('deleteObjectiveAction', () => {
  it('un objetivo publicado (409) explica que solo se eliminan borradores', async () => {
    fetchMock.mockResolvedValue(failure(409, 'OBJECTIVE_NOT_DRAFT'));
    expect((await deleteObjectiveAction('o1')).message).toMatch(/siguen en borrador/);
  });

  it('borra y vuelve a la lista', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteObjectiveAction('o1')).rejects.toThrow('NEXT_REDIRECT:/objetivos');
  });
});

describe('resultados clave', () => {
  it('crear: envía decimales como string y mapea INVALID_KR_RANGE', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ id: 'k1' }, { status: 201 }));
    const ok = await createKeyResultAction(
      'o1',
      idleState,
      form({
        title: 'Clientes',
        scoring: 'DERIVED',
        ownerId: 'u1',
        startValue: '0',
        targetValue: '100,5',
      }),
    );
    expect(ok.status).toBe('success');
    expect(await (fetchMock.mock.calls[0][0] as Request).json()).toMatchObject({
      startValue: '0',
      targetValue: '100.5',
    });

    fetchMock.mockResolvedValueOnce(failure(400, 'INVALID_KR_RANGE'));
    const bad = await createKeyResultAction(
      'o1',
      idleState,
      form({
        title: 'Clientes',
        scoring: 'DERIVED',
        ownerId: 'u1',
        startValue: '0',
        targetValue: '1',
      }),
    );
    expect(bad.message).toMatch(/no pueden ser iguales/);
  });

  it('editar la meta tras publicar sin permiso (403) explica que es del líder o administración', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }));
    const state = await updateKeyResultAction(
      'o1',
      'k1',
      { scoring: 'DERIVED', targetEditable: true },
      idleState,
      form({ title: 'Clientes', startValue: '0', targetValue: '200' }),
    );
    expect(state.message).toMatch(/líder o administración/);
  });
});
