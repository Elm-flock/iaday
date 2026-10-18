import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCookies } from '../../../../test/mocks/next-headers';
import {
  acceptAdaptationAction,
  decideSuggestionAction,
  requestAdaptationAction,
  suggestOkrAction,
  summarizeCheckInsAction,
  validateAdaptationAction,
} from './actions';
import { AI_RATE_LIMITED_COPY, AI_UNAVAILABLE_COPY } from './messages';

vi.mock('next/cache', () => ({ updateTag: vi.fn(), refresh: vi.fn() }));
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

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  __setCookies({ okr_at: 'tok' });
});

const adapted = { id: 'a1', status: 'DRAFT', requestedById: 'u1' };

describe('requestAdaptationAction', () => {
  it('POST con Bearer, entidad en el path y nivel en la query', async () => {
    fetchMock.mockResolvedValue(Response.json(adapted, { status: 201 }));
    const result = await requestAdaptationAction('check-in', 'c1', 'EASY_READ');
    expect(result).toEqual({ ok: true, data: adapted });
    expect(requestOf().method).toBe('POST');
    expect(requestOf().url).toMatch(/\/ai\/adapt\/check-in\/c1\?level=EASY_READ$/);
    expect(requestOf().headers.get('authorization')).toBe('Bearer tok');
  });

  it('rechaza entidad o nivel inválidos sin llamar al back', async () => {
    expect((await requestAdaptationAction('key-result', 'x', 'EASY_READ')).ok).toBe(false);
    expect((await requestAdaptationAction('objective', 'x', 'DIFICIL')).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('503 AI_DISABLED: nota de "no disponible", sin romper', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ statusCode: 503, message: 'x', code: 'AI_DISABLED' }, { status: 503 }),
    );
    expect(await requestAdaptationAction('objective', 'o1', 'PLAIN')).toEqual({
      ok: false,
      unavailable: true,
      message: AI_UNAVAILABLE_COPY,
    });
  });

  it('429: pedí de nuevo en un minuto (no es "no disponible")', async () => {
    fetchMock.mockResolvedValue(Response.json({ statusCode: 429 }, { status: 429 }));
    expect(await requestAdaptationAction('objective', 'o1', 'PLAIN')).toEqual({
      ok: false,
      unavailable: false,
      message: AI_RATE_LIMITED_COPY,
    });
  });

  it('API caída (red) = no disponible', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const result = await requestAdaptationAction('feedback', 'f1', 'PLAIN');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.unavailable).toBe(true);
  });

  it('feedback ajeno (404) no revela nada más que "no encontramos"', async () => {
    fetchMock.mockResolvedValue(Response.json({ statusCode: 404 }, { status: 404 }));
    const result = await requestAdaptationAction('feedback', 'f1', 'PLAIN');
    expect(!result.ok && result.message).toContain('No encontramos');
  });
});

describe('accept / validate', () => {
  it('acceptAdaptationAction: POST /ai/adapted/:id/accept', async () => {
    fetchMock.mockResolvedValue(Response.json({ ...adapted, status: 'ACCEPTED' }));
    const result = await acceptAdaptationAction('a1');
    expect(result.ok && result.data.status).toBe('ACCEPTED');
    expect(requestOf().url).toMatch(/\/ai\/adapted\/a1\/accept$/);
  });

  it('409 de estado: copy claro para recargar', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { statusCode: 409, message: 'x', code: 'AI_ADAPTATION_STATE_CONFLICT' },
        { status: 409 },
      ),
    );
    const result = await acceptAdaptationAction('a1');
    expect(!result.ok && result.message).toContain('Recargá');
  });

  it('validateAdaptationAction: PATCH con nota y contenido corregido; sin contenido si no se corrige', async () => {
    fetchMock.mockResolvedValue(Response.json({ ...adapted, status: 'VALIDATED' }));
    await validateAdaptationAction('a1', {
      note: '  ok  ',
      content: { segments: [{ key: 'checkin.note', text: 'Texto corregido' }] },
    });
    expect(requestOf().method).toBe('PATCH');
    expect(await requestOf().json()).toEqual({
      note: 'ok',
      content: { segments: [{ key: 'checkin.note', text: 'Texto corregido' }] },
    });
    await validateAdaptationAction('a1', { note: '   ' });
    expect(await requestOf(1).json()).toEqual({});
  });

  it('422 AI_EDITED_CONTENT_INVALID y AI_VALIDATION_NOT_ALLOWED tienen copy propio', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { statusCode: 422, message: 'x', code: 'AI_EDITED_CONTENT_INVALID' },
        { status: 422 },
      ),
    );
    expect(
      (await validateAdaptationAction('a1', { content: { segments: [] } })) as { message: string },
    ).toMatchObject({ message: expect.stringContaining('mismos bloques') });
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { statusCode: 422, message: 'x', code: 'AI_VALIDATION_NOT_ALLOWED' },
        { status: 422 },
      ),
    );
    expect((await validateAdaptationAction('a1', {})) as { message: string }).toMatchObject({
      message: expect.stringContaining('privado'),
    });
  });
});

describe('sugerencias y resumen', () => {
  it('suggestOkrAction manda el borrador tal cual y devuelve la sugerencia sin aplicar nada', async () => {
    const suggestion = { id: 's1', payload: {}, needsHumanReview: false };
    fetchMock.mockResolvedValue(Response.json(suggestion));
    const input = {
      cycleId: 'c1',
      ownerUserId: 'u1',
      draft: { title: 'mejorar soporte', type: 'COMMITTED' as const },
    };
    expect(await suggestOkrAction(input)).toEqual({ ok: true, data: suggestion });
    expect(requestOf().url).toMatch(/\/ai\/okr-suggest$/);
    expect(await requestOf().json()).toEqual(input);
    // Solo un pedido: nunca toca /objectives.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('summarizeCheckInsAction: nivel por query; 422 sin check-ins con copy propio', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { statusCode: 422, message: 'x', code: 'AI_NOTHING_TO_SUMMARIZE' },
        { status: 422 },
      ),
    );
    const result = await summarizeCheckInsAction('k1');
    expect(requestOf().url).toMatch(/\/ai\/check-ins\/k1\/summary\?level=STANDARD$/);
    expect(!result.ok && result.message).toContain('Todavía no hay check-ins');
  });

  it('decideSuggestionAction: accept y discard van a su endpoint', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 's1' }));
    await decideSuggestionAction('s1', 'accept');
    await decideSuggestionAction('s1', 'discard');
    expect(requestOf(0).url).toMatch(/\/ai\/suggestions\/s1\/accept$/);
    expect(requestOf(1).url).toMatch(/\/ai\/suggestions\/s1\/discard$/);
  });
});
