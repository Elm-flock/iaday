import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KrFormModal } from '../../objetivos/_components/kr-form-modal';
import { ObjectiveCreateForm } from '../../objetivos/_components/objective-create-form';
import { ToastProvider } from '@/components/ui/toast';

const okrActions = vi.hoisted(() => ({
  createObjectiveAction: vi.fn(),
  createKeyResultAction: vi.fn(),
  updateKeyResultAction: vi.fn(),
}));
vi.mock('../../objetivos/actions', () => okrActions);

const ai = vi.hoisted(() => ({ suggestOkrAction: vi.fn(), decideSuggestionAction: vi.fn() }));
vi.mock('../actions', () => ai);

beforeEach(() => {
  okrActions.createObjectiveAction.mockReset();
  okrActions.createKeyResultAction.mockReset();
  ai.suggestOkrAction.mockReset();
  ai.decideSuggestionAction.mockReset().mockResolvedValue({ ok: true, data: {} });
});

const owners = {
  users: [{ value: 'user:u1', label: 'Mica (vos)' }],
  teams: [],
  explanation: 'Solo podés crear objetivos propios.',
};

const suggestion = {
  ok: true as const,
  data: {
    id: 's1',
    needsHumanReview: false,
    payload: {
      objective: {
        title: 'Dar un soporte rápido y predecible',
        description: 'Que se resuelva el mismo día.',
        rationale: 'r',
      },
      keyResults: [
        {
          title: 'Reducir P1 de 8 h a 4 h',
          unit: 'h',
          startValue: '8',
          targetValue: '4',
          rationale: 'r',
          proposedValues: false,
        },
      ],
      warnings: [],
    },
  },
};

const createForm = (aiEnabled: boolean) =>
  render(
    <ObjectiveCreateForm
      cycles={[{ id: 'c1', label: 'Q1' }]}
      defaultCycleId="c1"
      owners={owners}
      defaultOwner="user:u1"
      parents={[]}
      aiEnabled={aiEnabled}
    />,
  );

describe('ObjectiveCreateForm + Sugerir redacción', () => {
  it('con la IA apagada no hay botón', () => {
    createForm(false);
    expect(screen.queryByRole('button', { name: 'Sugerir redacción' })).not.toBeInTheDocument();
  });

  it('manda lo que la persona lleva escrito, y solo al usar la sugerencia precarga (sin enviar el formulario)', async () => {
    ai.suggestOkrAction.mockResolvedValue(suggestion);
    createForm(true);
    await userEvent.type(screen.getByLabelText(/Título/), 'mejorar soporte');
    await userEvent.type(screen.getByLabelText('Descripción'), 'borrador mío');

    await userEvent.click(screen.getByRole('button', { name: 'Sugerir redacción' }));
    await screen.findByTestId('okr-suggestion');
    expect(ai.suggestOkrAction).toHaveBeenCalledWith({
      cycleId: 'c1',
      ownerUserId: 'u1',
      draft: { title: 'mejorar soporte', type: 'COMMITTED', description: 'borrador mío' },
    });
    // Mientras no decida, el formulario queda como lo dejó la persona.
    expect(screen.getByLabelText(/Título/)).toHaveValue('mejorar soporte');

    await userEvent.click(screen.getByRole('button', { name: 'Usar sugerencia' }));
    expect(screen.getByLabelText(/Título/)).toHaveValue('Dar un soporte rápido y predecible');
    expect(screen.getByLabelText('Descripción')).toHaveValue('Que se resuelva el mismo día.');
    // Nunca se envía solo.
    expect(okrActions.createObjectiveAction).not.toHaveBeenCalled();
    expect(screen.queryByTestId('okr-suggestion')).not.toBeInTheDocument();
  });

  it('descartar deja el borrador intacto', async () => {
    ai.suggestOkrAction.mockResolvedValue(suggestion);
    createForm(true);
    await userEvent.type(screen.getByLabelText(/Título/), 'mejorar soporte');
    await userEvent.click(screen.getByRole('button', { name: 'Sugerir redacción' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
    expect(screen.getByLabelText(/Título/)).toHaveValue('mejorar soporte');
    expect(okrActions.createObjectiveAction).not.toHaveBeenCalled();
  });

  it('sin título explica qué falta y no llama a la IA', async () => {
    createForm(true);
    await userEvent.click(screen.getByRole('button', { name: 'Sugerir redacción' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escribí un borrador del título');
    expect(ai.suggestOkrAction).not.toHaveBeenCalled();
  });
});

const objectiveCtx = {
  id: 'o1',
  cycleId: 'c1',
  title: 'Soporte',
  description: null,
  type: 'COMMITTED' as const,
};

const krModal = (props: { targetLocked?: boolean; suggest?: boolean } = {}) =>
  render(
    <ToastProvider>
      <KrFormModal
        objectiveId="o1"
        people={[{ id: 'u1', name: 'Mica' }]}
        defaultOwnerId="u1"
        targetLocked={props.targetLocked ?? false}
        suggestContext={props.suggest === false ? undefined : objectiveCtx}
        onClose={() => {}}
      />
    </ToastProvider>,
  );

describe('KrFormModal + Sugerir redacción', () => {
  it('sin contexto de IA (apagada) no hay botón', () => {
    krModal({ suggest: false });
    expect(screen.queryByRole('button', { name: 'Sugerir redacción' })).not.toBeInTheDocument();
  });

  it('precarga título, unidad, inicio y meta (es-AR) sin guardar el KR', async () => {
    ai.suggestOkrAction.mockResolvedValue(suggestion);
    krModal();
    await userEvent.type(screen.getByLabelText(/Resultado clave/), 'bajar tiempo P1');
    await userEvent.click(screen.getByRole('button', { name: 'Sugerir redacción' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Usar sugerencia' }));
    expect(ai.suggestOkrAction.mock.calls[0][0]).toMatchObject({
      objectiveId: 'o1',
      draft: { keyResults: [{ title: 'bajar tiempo P1' }] },
    });
    expect(screen.getByLabelText(/Resultado clave/)).toHaveValue('Reducir P1 de 8 h a 4 h');
    expect(screen.getByLabelText(/Valor inicial/)).toHaveValue('8');
    expect(screen.getByLabelText(/Meta/)).toHaveValue('4');
    expect(screen.getByLabelText(/Unidad/)).toHaveValue('h');
    expect(okrActions.createKeyResultAction).not.toHaveBeenCalled();
  });
});
