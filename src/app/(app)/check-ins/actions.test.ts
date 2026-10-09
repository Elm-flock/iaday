import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCookies } from '../../../../test/mocks/next-headers';
import { createCheckInAction } from './actions';
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
const failure = (status: number, code: string) =>
  Response.json({ statusCode: status, code, message: 'x' }, { status });

const derived = { objectiveId: 'o1', krId: 'k1', scoring: 'DERIVED' as const };
const manual = { objectiveId: 'o1', krId: 'k2', scoring: 'MANUAL' as const };

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  mocks.updateTag.mockClear();
  __setCookies({ okr_at: 'tok' });
});

describe('createCheckInAction', () => {
  it('no llama al back con datos inválidos', async () => {
    const state = await createCheckInAction(derived, idleState, form({ action: 'UPDATE' }));
    expect(state.status).toBe('error');
    expect(state.fieldErrors?.value).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('registra con Bearer e invalida objetivo, KR, lista y pendientes', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'c1' }, { status: 201 }));
    const state = await createCheckInAction(
      derived,
      idleState,
      form({ action: 'UPDATE', value: '45,5', note: 'va bien' }),
    );
    expect(state.status).toBe('success');
    const request = fetchMock.mock.calls[0][0] as Request;
    expect(request.url).toMatch(/\/key-results\/k1\/check-ins$/);
    expect(request.headers.get('authorization')).toBe('Bearer tok');
    expect(await request.json()).toEqual({ action: 'UPDATE', value: '45.5', note: 'va bien' });
    const tags = mocks.updateTag.mock.calls.map((c) => c[0]);
    expect(tags).toEqual(['okrs', 'objective:o1', 'kr:k1', 'check-ins:pending']);
  });

  it('KR manual envía manualScore numérico', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'c1' }, { status: 201 }));
    await createCheckInAction(manual, idleState, form({ action: 'CONTINUE', manualScore: '0.6' }));
    const request = fetchMock.mock.calls[0][0] as Request;
    expect(await request.json()).toEqual({ action: 'CONTINUE', manualScore: 0.6 });
  });

  it('409 por objetivo cerrado se explica en español y conserva lo tipeado', async () => {
    fetchMock.mockResolvedValue(failure(409, 'OBJECTIVE_CLOSED'));
    const state = await createCheckInAction(
      derived,
      idleState,
      form({ action: 'UPDATE', value: '10' }),
    );
    expect(state.status).toBe('error');
    expect(state.message).toMatch(/cerrado/);
    expect(state.values?.value).toBe('10');
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it('403 explica quién puede registrar', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ statusCode: 403 }), { status: 403 }));
    const state = await createCheckInAction(
      derived,
      idleState,
      form({ action: 'UPDATE', value: '10' }),
    );
    expect(state.message).toMatch(/No podés registrar check-ins/);
  });
});
