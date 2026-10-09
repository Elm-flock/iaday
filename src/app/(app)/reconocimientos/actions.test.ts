import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCookies } from '../../../../test/mocks/next-headers';
import { createRecognitionAction } from './actions';
import { idleState } from '@/lib/actions/form-state';

const mocks = vi.hoisted(() => ({ updateTag: vi.fn() }));
vi.mock('next/cache', () => ({ updateTag: mocks.updateTag }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
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
const valid = { toUserId: 'ana', milestone: 'kr:o1:k1', message: 'Gran trabajo' };

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  mocks.updateTag.mockClear();
  __setCookies({ okr_at: 'tok' });
});

describe('createRecognitionAction', () => {
  it('no llama al back sin logro', async () => {
    const state = await createRecognitionAction(idleState, form({ ...valid, milestone: '' }));
    expect(state.status).toBe('error');
    expect(state.fieldErrors?.milestone).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('crea, invalida el muro y vuelve a él', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'r1' }, { status: 201 }));
    await expect(createRecognitionAction(idleState, form(valid))).rejects.toThrow(
      'NEXT_REDIRECT:/reconocimientos?creado=1',
    );
    const request = fetchMock.mock.calls[0][0] as Request;
    expect(await request.json()).toEqual({
      toUserId: 'ana',
      message: 'Gran trabajo',
      objectiveId: 'o1',
      keyResultId: 'k1',
    });
    expect(mocks.updateTag).toHaveBeenCalledWith('recognitions');
  });

  it('422 MILESTONE_NOT_REACHED: muestra el copy de la regla y conserva lo elegido', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { statusCode: 422, code: 'MILESTONE_NOT_REACHED', message: 'x' },
        { status: 422 },
      ),
    );
    const state = await createRecognitionAction(idleState, form(valid));
    expect(state.status).toBe('error');
    expect(state.message).toMatch(/0,70/);
    expect(state.values?.milestone).toBe('kr:o1:k1');
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it('autorreconocimiento (400)', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ statusCode: 400, message: 'x', code: 'RECOGNITION_SELF' }, { status: 400 }),
    );
    const state = await createRecognitionAction(idleState, form(valid));
    expect(state.message).toMatch(/No podés reconocerte a vos mismo/);
  });
});
