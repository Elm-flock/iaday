import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCookies } from '../../../../test/mocks/next-headers';
import {
  activateCycleAction,
  closeCycleAction,
  createCycleAction,
  updateCycleAction,
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

const quarter = {
  name: 'Q1 2026',
  kind: 'QUARTER',
  parentId: 'a26',
  startDate: '2026-01-01',
  endDate: '2026-03-31',
  checkInCadence: 'WEEKLY',
  committedThreshold: '1,00',
  aspirationalThreshold: '0,70',
};

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  mocks.updateTag.mockClear();
  __setCookies({ okr_at: 'tok' });
});

describe('nombre de ciclo repetido (409 CYCLE_NAME_TAKEN)', () => {
  const taken = () =>
    fetchMock.mockResolvedValue(
      Response.json({ statusCode: 409, code: 'CYCLE_NAME_TAKEN', message: 'x' }, { status: 409 }),
    );

  it('al crear, se marca el campo Nombre y se conserva lo tipeado', async () => {
    taken();
    const state = await createCycleAction(idleState, form({ ...quarter, name: ' Q1 2026 ' }));
    expect(state.status).toBe('error');
    expect(state.fieldErrors?.name).toBe(
      'Ya existe un ciclo llamado «Q1 2026». Elegí otro nombre o usá el existente.',
    );
    expect(state.values?.startDate).toBe('2026-01-01');
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it('al editar, también se marca el campo Nombre', async () => {
    taken();
    const state = await updateCycleAction('q1', true, idleState, form(quarter));
    expect(state.fieldErrors?.name).toContain('«Q1 2026»');
  });
});

describe('createCycleAction', () => {
  it('no llama al back si el formulario es inválido', async () => {
    const state = await createCycleAction(idleState, form({ ...quarter, name: '' }));
    expect(state.status).toBe('error');
    expect(state.fieldErrors?.name).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envía umbrales como número con el Bearer y registra el éxito invalidando la cache', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'q1' }, { status: 201 }));
    const state = await createCycleAction(idleState, form(quarter));

    expect(state).toEqual({ status: 'success', message: 'Creamos el ciclo "Q1 2026".' });
    const request = fetchMock.mock.calls[0][0] as Request;
    expect(request.headers.get('authorization')).toBe('Bearer tok');
    expect(await request.json()).toMatchObject({
      committedThreshold: 1,
      aspirationalThreshold: 0.7,
      parentId: 'a26',
    });
    expect(mocks.updateTag).toHaveBeenCalledWith('cycles');
  });

  it('traduce el solapamiento (422) a un mensaje claro en español y conserva lo tipeado', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { statusCode: 422, code: 'QUARTER_OVERLAPS_SIBLING', message: 'x' },
        { status: 422 },
      ),
    );
    const state = await createCycleAction(idleState, form(quarter));
    expect(state.status).toBe('error');
    expect(state.message).toMatch(/se superpone con otro del mismo ciclo anual/);
    expect(state.values?.name).toBe('Q1 2026');
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it.each([
    ['INVALID_DATE_RANGE', 400, /anterior a la de fin/],
    ['QUARTER_OUT_OF_PARENT_RANGE', 400, /dentro de las del ciclo anual/],
    ['INVALID_THRESHOLD', 400, /mayores a 0 y hasta 1/],
  ])('mapea %s', async (code, status, expected) => {
    fetchMock.mockResolvedValue(
      Response.json({ statusCode: status, code, message: 'x' }, { status }),
    );
    const state = await createCycleAction(idleState, form(quarter));
    expect(state.message).toMatch(expected);
  });

  it('un 403 explica que falta permiso y una caída de red avisa del servidor', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));
    expect((await createCycleAction(idleState, form(quarter))).message).toMatch(
      /No tenés permisos/,
    );
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect((await createCycleAction(idleState, form(quarter))).message).toMatch(
      /No pudimos conectarnos/,
    );
  });

  it('un 401 redirige a /login (el redirect no se traga)', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(createCycleAction(idleState, form(quarter))).rejects.toThrow(
      'NEXT_REDIRECT:/login',
    );
  });
});

describe('activateCycleAction / closeCycleAction', () => {
  it('activar invalida `cycles` y `cycle:{id}`', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'c1' }, { status: 201 }));
    const state = await activateCycleAction('c1');
    expect(state.status).toBe('success');
    expect(mocks.updateTag).toHaveBeenCalledWith('cycles');
    expect(mocks.updateTag).toHaveBeenCalledWith('cycle:c1');
  });

  it('cerrar informa cuántos objetivos se cerraron y cuántos lograron el umbral', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ id: 'c1', closedObjectives: 4, achievedObjectives: 3 }, { status: 201 }),
    );
    const state = await closeCycleAction('c1');
    expect(state.message).toBe(
      'Cerramos el ciclo. Se cerraron 4 objetivos y 3 alcanzaron el umbral.',
    );
    expect(mocks.updateTag).toHaveBeenCalledWith('okrs');
  });

  it('una transición inválida se explica y no invalida nada', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ code: 'INVALID_CYCLE_TRANSITION', message: 'x' }, { status: 422 }),
    );
    const state = await closeCycleAction('c1');
    expect(state.status).toBe('error');
    expect(state.message).toMatch(/ya cambió de estado/);
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });
});
