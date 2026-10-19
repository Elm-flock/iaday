import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessibleVersionPanel } from './accessible-version-panel';
import { AiStatusBadge } from './ai-status-badge';
import { CheckInSummaryButton } from './checkin-summary-button';
import { SuggestOkrButton } from './suggest-okr-button';
import { AI_UNAVAILABLE_COPY } from '../messages';

const actions = vi.hoisted(() => ({
  requestAdaptationAction: vi.fn(),
  acceptAdaptationAction: vi.fn(),
  validateAdaptationAction: vi.fn(),
  suggestOkrAction: vi.fn(),
  summarizeCheckInsAction: vi.fn(),
  decideSuggestionAction: vi.fn(),
}));
vi.mock('../actions', () => actions);

const adapted = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  entityType: 'CHECK_IN',
  entityId: 'c1',
  level: 'EASY_READ',
  status: 'DRAFT',
  requestedById: 'me',
  cached: false,
  content: {
    segments: [
      { key: 'checkin.note', text: 'Avanzamos. Falta poco.' },
      { key: 'checkin.action', text: 'Seguimos igual.' },
    ],
    glossary: [{ term: 'KR', explanation: 'Resultado clave.' }],
  },
  ...over,
});

const ok = <T,>(data: T) => ({ ok: true as const, data });
const unavailable = { ok: false as const, unavailable: true, message: AI_UNAVAILABLE_COPY };

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
});

const panel = (
  validation: { allowed: boolean; reason?: 'feedback' | 'permission' } = {
    allowed: false,
    reason: 'permission',
  },
  viewerId = 'me',
  entityType: 'check-in' | 'feedback' = 'check-in',
) =>
  render(
    <AccessibleVersionPanel
      entityType={entityType}
      entityId="c1"
      viewerId={viewerId}
      validation={validation as never}
    />,
  );

describe('AiStatusBadge', () => {
  it('cada estado dice la palabra, no solo el color', () => {
    const { rerender } = render(<AiStatusBadge status="DRAFT" />);
    expect(screen.getByText('Generado por IA · pendiente de validación')).toBeInTheDocument();
    rerender(<AiStatusBadge status="ACCEPTED" />);
    expect(screen.getByText('Generado por IA · pendiente de validación')).toBeInTheDocument();
    rerender(<AiStatusBadge status="VALIDATED" />);
    expect(screen.getByText('Validado por una persona')).toBeInTheDocument();
    rerender(<AiStatusBadge status="NEEDS_REVIEW" />);
    expect(screen.getByText('Requiere revisión humana')).toBeInTheDocument();
  });
});

describe('AccessibleVersionPanel', () => {
  it('ofrece los dos niveles y no muestra nada generado hasta que se pide', () => {
    panel();
    expect(screen.getByRole('button', { name: 'Ver en lectura fácil' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver en lenguaje claro' })).toBeInTheDocument();
    expect(screen.queryByTestId('adapted-text')).not.toBeInTheDocument();
  });

  it('pide la versión, la muestra con badge "Generado por IA" y el glosario', async () => {
    actions.requestAdaptationAction.mockResolvedValue(ok(adapted()));
    panel();
    await userEvent.click(screen.getByRole('button', { name: 'Ver en lectura fácil' }));
    expect(actions.requestAdaptationAction).toHaveBeenCalledWith('check-in', 'c1', 'EASY_READ');
    const text = await screen.findByTestId('adapted-text');
    expect(within(text).getByText('Avanzamos. Falta poco.')).toBeInTheDocument();
    expect(screen.getByText('Generado por IA · pendiente de validación')).toBeInTheDocument();
    expect(screen.getByText('Resultado clave.')).toBeInTheDocument();
  });

  it('ofrece pedir el documento a una persona, vinculado al elemento (también sin pedir la versión de IA)', () => {
    panel();
    const link = screen.getByRole('link', { name: 'Pedilo a una persona' });
    expect(link).toHaveAttribute('href', '/pedidos-adaptacion/nuevo?tipo=check-in&id=c1');
    expect(screen.getByText(/¿Necesitás otro formato\?/)).toBeInTheDocument();
  });

  it('"Me sirve" solo para quien la pidió y pasa a ACCEPTED', async () => {
    actions.requestAdaptationAction.mockResolvedValue(ok(adapted()));
    actions.acceptAdaptationAction.mockResolvedValue(ok(adapted({ status: 'ACCEPTED' })));
    panel();
    await userEvent.click(screen.getByRole('button', { name: 'Ver en lectura fácil' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Me sirve' }));
    expect(actions.acceptAdaptationAction).toHaveBeenCalledWith('a1');
    expect(await screen.findByText('Marcaste que esta versión te sirve.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Me sirve' })).not.toBeInTheDocument();
  });

  it('si la pidió otra persona (caché compartida) no ofrece "Me sirve"', async () => {
    actions.requestAdaptationAction.mockResolvedValue(
      ok(adapted({ requestedById: 'otra', cached: true })),
    );
    panel();
    await userEvent.click(screen.getByRole('button', { name: 'Ver en lectura fácil' }));
    await screen.findByTestId('adapted-text');
    expect(screen.queryByRole('button', { name: 'Me sirve' })).not.toBeInTheDocument();
  });

  it('quien puede validar corrige un bloque y se envía el contenido corregido con la nota', async () => {
    actions.requestAdaptationAction.mockResolvedValue(ok(adapted()));
    actions.validateAdaptationAction.mockResolvedValue(
      ok(adapted({ status: 'VALIDATED', humanEdited: true })),
    );
    panel({ allowed: true });
    await userEvent.click(screen.getByRole('button', { name: 'Ver en lectura fácil' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Validar' }));

    const block1 = screen.getByLabelText('Bloque 1');
    await userEvent.clear(block1);
    await userEvent.type(block1, 'Avanzamos mucho.');
    await userEvent.type(
      screen.getByLabelText('Nota de validación (opcional)'),
      'Revisado con el equipo',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Validar versión' }));

    expect(actions.validateAdaptationAction).toHaveBeenCalledWith('a1', {
      note: 'Revisado con el equipo',
      content: {
        segments: [
          { key: 'checkin.note', text: 'Avanzamos mucho.' },
          { key: 'checkin.action', text: 'Seguimos igual.' },
        ],
        glossary: [{ term: 'KR', explanation: 'Resultado clave.' }],
      },
    });
    expect(await screen.findByText('Validado por una persona')).toBeInTheDocument();
    // VALIDATED es terminal: ya no se ofrece validar.
    expect(screen.queryByRole('button', { name: 'Validar' })).not.toBeInTheDocument();
  });

  it('validar sin corregir no manda `content`', async () => {
    actions.requestAdaptationAction.mockResolvedValue(ok(adapted()));
    actions.validateAdaptationAction.mockResolvedValue(ok(adapted({ status: 'VALIDATED' })));
    panel({ allowed: true });
    await userEvent.click(screen.getByRole('button', { name: 'Ver en lectura fácil' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Validar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Validar versión' }));
    const [, body] = actions.validateAdaptationAction.mock.calls[0];
    expect(body.content).toBeUndefined();
  });

  it('sin permiso: "Validar" deshabilitado con la explicación', async () => {
    actions.requestAdaptationAction.mockResolvedValue(ok(adapted()));
    panel({ allowed: false, reason: 'permission' });
    await userEvent.click(screen.getByRole('button', { name: 'Ver en lectura fácil' }));
    const button = await screen.findByRole('button', { name: 'Validar' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/administración o el líder del equipo/);
  });

  it('feedback: nunca validable y lo explica por privacidad', async () => {
    actions.requestAdaptationAction.mockResolvedValue(ok(adapted({ entityType: 'FEEDBACK' })));
    panel({ allowed: false, reason: 'feedback' }, 'me', 'feedback');
    await userEvent.click(screen.getByRole('button', { name: 'Ver en lenguaje claro' }));
    expect(actions.requestAdaptationAction).toHaveBeenCalledWith('feedback', 'c1', 'PLAIN');
    const button = await screen.findByRole('button', { name: 'Validar' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/feedback es privado/);
  });

  it('NEEDS_REVIEW: avisa que se ve el texto original y que requiere revisión humana', async () => {
    actions.requestAdaptationAction.mockResolvedValue(ok(adapted({ status: 'NEEDS_REVIEW' })));
    panel();
    await userEvent.click(screen.getByRole('button', { name: 'Ver en lectura fácil' }));
    expect(await screen.findByText(/te mostramos el texto original/)).toBeInTheDocument();
    expect(screen.getAllByText('Requiere revisión humana').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Me sirve' })).not.toBeInTheDocument();
  });

  it('IA no disponible: nota no bloqueante y los botones siguen ahí', async () => {
    actions.requestAdaptationAction.mockResolvedValue(unavailable);
    panel();
    await userEvent.click(screen.getByRole('button', { name: 'Ver en lectura fácil' }));
    expect(await screen.findByTestId('ai-note')).toHaveTextContent(AI_UNAVAILABLE_COPY);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver en lectura fácil' })).toBeEnabled();
  });

  it('otro error (429) se muestra como alerta con cómo seguir', async () => {
    actions.requestAdaptationAction.mockResolvedValue({
      ok: false,
      unavailable: false,
      message: 'Hiciste muchos pedidos seguidos. Probá en un minuto.',
    });
    panel();
    await userEvent.click(screen.getByRole('button', { name: 'Ver en lectura fácil' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Probá en un minuto');
  });
});

const parsedPayload = {
  objective: {
    title: 'Dar un soporte rápido',
    description: 'Que se resuelva el mismo día.',
    rationale: 'r',
  },
  keyResults: [
    {
      title: 'Cubrir el 100 % de incidencias P1',
      unit: '%',
      startValue: '0',
      targetValue: '100',
      rationale: 'mide cobertura',
      proposedValues: true,
    },
  ],
  warnings: [{ code: 'TOO_FEW_KRS', message: 'Sumá al menos uno más.' }],
};

describe('SuggestOkrButton', () => {
  const build = (ok = true) =>
    vi.fn(() =>
      ok
        ? {
            ok: true as const,
            input: { cycleId: 'c1', draft: { title: 't', type: 'COMMITTED' as const } },
          }
        : {
            ok: false as const,
            message: 'Escribí un borrador del título para que podamos sugerirte una redacción.',
          },
    );

  it('muestra la sugerencia con warnings y valores propuestos resaltados, y NO la aplica sola', async () => {
    actions.suggestOkrAction.mockResolvedValue(
      ok({ id: 's1', needsHumanReview: false, payload: parsedPayload }),
    );
    const onUse = vi.fn();
    render(<SuggestOkrButton buildInput={build()} onUse={onUse} scope="objective" />);
    await userEvent.click(screen.getByRole('button', { name: 'Sugerir redacción' }));
    const card = await screen.findByTestId('okr-suggestion');
    expect(within(card).getByText('Generado por IA')).toBeInTheDocument();
    expect(within(card).getByText('Dar un soporte rápido')).toBeInTheDocument();
    expect(within(card).getByText('Sumá al menos uno más.')).toBeInTheDocument();
    expect(within(card).getByTestId('proposed-values')).toHaveTextContent(
      'Valores propuestos por la IA',
    );
    expect(onUse).not.toHaveBeenCalled();
  });

  it('"Usar sugerencia" entrega la sugerencia al formulario y registra la aceptación', async () => {
    actions.suggestOkrAction.mockResolvedValue(
      ok({ id: 's1', needsHumanReview: false, payload: parsedPayload }),
    );
    actions.decideSuggestionAction.mockResolvedValue(ok({ id: 's1' }));
    const onUse = vi.fn();
    render(<SuggestOkrButton buildInput={build()} onUse={onUse} scope="objective" />);
    await userEvent.click(screen.getByRole('button', { name: 'Sugerir redacción' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Usar sugerencia' }));
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onUse.mock.calls[0][0].objective.title).toBe('Dar un soporte rápido');
    await waitFor(() =>
      expect(actions.decideSuggestionAction).toHaveBeenCalledWith('s1', 'accept'),
    );
    expect(screen.queryByTestId('okr-suggestion')).not.toBeInTheDocument();
  });

  it('"Descartar" cierra la sugerencia, no precarga nada y lo registra', async () => {
    actions.suggestOkrAction.mockResolvedValue(
      ok({ id: 's1', needsHumanReview: true, payload: parsedPayload }),
    );
    actions.decideSuggestionAction.mockResolvedValue(ok({ id: 's1' }));
    const onUse = vi.fn();
    render(<SuggestOkrButton buildInput={build()} onUse={onUse} scope="kr" />);
    await userEvent.click(screen.getByRole('button', { name: 'Sugerir redacción' }));
    expect(await screen.findByText('Requiere revisión humana')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(onUse).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(actions.decideSuggestionAction).toHaveBeenCalledWith('s1', 'discard'),
    );
    expect(screen.queryByTestId('okr-suggestion')).not.toBeInTheDocument();
  });

  it('scope kr muestra solo el KR, sin el objetivo', async () => {
    actions.suggestOkrAction.mockResolvedValue(
      ok({ id: 's1', needsHumanReview: false, payload: parsedPayload }),
    );
    render(<SuggestOkrButton buildInput={build()} onUse={vi.fn()} scope="kr" />);
    await userEvent.click(screen.getByRole('button', { name: 'Sugerir redacción' }));
    const card = await screen.findByTestId('okr-suggestion');
    expect(within(card).queryByText('Dar un soporte rápido')).not.toBeInTheDocument();
    expect(within(card).getByText('Cubrir el 100 % de incidencias P1')).toBeInTheDocument();
  });

  it('si falta el borrador explica qué falta y no llama al back', async () => {
    render(<SuggestOkrButton buildInput={build(false)} onUse={vi.fn()} scope="objective" />);
    await userEvent.click(screen.getByRole('button', { name: 'Sugerir redacción' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escribí un borrador del título');
    expect(actions.suggestOkrAction).not.toHaveBeenCalled();
  });

  it('IA no disponible: nota no bloqueante', async () => {
    actions.suggestOkrAction.mockResolvedValue(unavailable);
    render(<SuggestOkrButton buildInput={build()} onUse={vi.fn()} scope="objective" />);
    await userEvent.click(screen.getByRole('button', { name: 'Sugerir redacción' }));
    expect(await screen.findByTestId('ai-note')).toHaveTextContent(AI_UNAVAILABLE_COPY);
  });
});

describe('CheckInSummaryButton', () => {
  const summary = {
    summary: 'El KR avanza de a poco.',
    trend: 'IMPROVING',
    highlights: ['Se cerraron 3 runbooks'],
    risks: ['Falta acceso al sistema'],
  };

  it('muestra resumen, tendencia con ícono y palabra, destacados y riesgos', async () => {
    actions.summarizeCheckInsAction.mockResolvedValue(
      ok({ id: 's1', needsHumanReview: false, payload: summary }),
    );
    render(<CheckInSummaryButton krId="k1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Resumir check-ins' }));
    const card = await screen.findByTestId('checkin-summary');
    expect(actions.summarizeCheckInsAction).toHaveBeenCalledWith('k1');
    expect(within(card).getByText('El KR avanza de a poco.')).toBeInTheDocument();
    expect(within(card).getByText('Mejorando')).toBeInTheDocument();
    expect(within(card).getByText('Se cerraron 3 runbooks')).toBeInTheDocument();
    expect(within(card).getByText('Falta acceso al sistema')).toBeInTheDocument();
    expect(within(card).getByText('Generado por IA')).toBeInTheDocument();
  });

  it('"Me sirve" registra la decisión; "Descartar" cierra el resumen', async () => {
    actions.summarizeCheckInsAction.mockResolvedValue(
      ok({ id: 's1', needsHumanReview: false, payload: summary }),
    );
    actions.decideSuggestionAction.mockResolvedValue(ok({ id: 's1' }));
    render(<CheckInSummaryButton krId="k1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Resumir check-ins' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Me sirve' }));
    expect(actions.decideSuggestionAction).toHaveBeenCalledWith('s1', 'accept');
    expect(await screen.findByText('Gracias: anotamos que te sirvió.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Resumir check-ins' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
    expect(actions.decideSuggestionAction).toHaveBeenLastCalledWith('s1', 'discard');
    await waitFor(() => expect(screen.queryByTestId('checkin-summary')).not.toBeInTheDocument());
  });

  it('IA caída: nota no bloqueante', async () => {
    actions.summarizeCheckInsAction.mockResolvedValue(unavailable);
    render(<CheckInSummaryButton krId="k1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Resumir check-ins' }));
    expect(await screen.findByTestId('ai-note')).toBeInTheDocument();
  });
});
