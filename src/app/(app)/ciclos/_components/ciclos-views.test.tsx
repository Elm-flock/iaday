import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { cycle } from '../../../../../test/factories';
import { CycleDetailView } from './cycle-detail-view';
import { CycleFormModal } from './cycle-form-modal';
import { CyclesTreeView } from './cycles-tree-view';
import { ToastProvider } from '@/components/ui/toast';
import type { FormState } from '@/lib/actions/form-state';

const actions = vi.hoisted(() => ({
  createCycleAction: vi.fn(),
  updateCycleAction: vi.fn(),
}));
vi.mock('../actions', () => actions);

const annual = cycle({ id: 'a26', name: 'OKR 2026', status: 'ACTIVE' });
const quarter = cycle({
  id: 'q1',
  name: 'Q1 2026',
  kind: 'QUARTER',
  parentId: 'a26',
  startDate: '2026-01-01',
  endDate: '2026-03-31',
});

describe('CyclesTreeView', () => {
  it('muestra anuales con sus trimestres, fechas dd/mm/aaaa y estado con palabra', () => {
    render(<CyclesTreeView cycles={[annual, quarter]} />);
    const card = screen.getByRole('region', { name: 'OKR 2026' });
    expect(within(card).getByRole('link', { name: 'OKR 2026' })).toHaveAttribute(
      'href',
      '/ciclos/a26',
    );
    expect(within(card).getByRole('link', { name: 'Q1 2026' })).toHaveAttribute(
      'href',
      '/ciclos/q1',
    );
    expect(within(card).getByText('01/01/2026 al 31/03/2026')).toBeInTheDocument();
    expect(within(card).getByText('Activo')).toBeInTheDocument();
    expect(within(card).getByText('Borrador')).toBeInTheDocument();
  });

  it('sin ciclos muestra el estado vacío con la acción sugerida', () => {
    render(<CyclesTreeView cycles={[]} emptyAction={<button>Crear ciclo</button>} />);
    expect(screen.getByText('Todavía no hay ciclos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear ciclo' })).toBeInTheDocument();
  });
});

describe('CycleDetailView', () => {
  it('muestra los umbrales con coma decimal y fechas dd/mm/aaaa', () => {
    render(<CycleDetailView cycle={annual} quarters={[quarter]} />);
    expect(screen.getByTestId('committed-threshold')).toHaveTextContent('1,00');
    expect(screen.getByTestId('aspirational-threshold')).toHaveTextContent('0,70');
    expect(screen.getByText('31/12/2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Q1 2026' })).toBeInTheDocument();
  });

  it('en un ciclo cerrado avisa que los umbrales ya no se editan', () => {
    render(
      <CycleDetailView
        cycle={cycle({ status: 'CLOSED', closedAt: '2026-12-31T15:00:00.000Z' })}
        quarters={[]}
      />,
    );
    expect(screen.getByText(/ya no se pueden cambiar/)).toBeInTheDocument();
    expect(screen.getByText('Cerrado')).toBeInTheDocument();
  });
});

describe('CycleFormModal', () => {
  it('muestra el error de la API en español y conserva lo tipeado', async () => {
    const overlap: FormState = {
      status: 'error',
      message:
        'Ese trimestre se superpone con otro del mismo ciclo anual. Elegí fechas que no se pisen con los trimestres existentes.',
      values: { name: 'Q1 repetido' },
    };
    actions.createCycleAction.mockResolvedValue(overlap);

    render(
      <ToastProvider>
        <CycleFormModal mode="create" annuals={[annual]} onClose={() => {}} />
      </ToastProvider>,
    );
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Q1 repetido');
    await userEvent.click(screen.getByRole('button', { name: 'Crear ciclo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/se superpone con otro/);
    expect(screen.getByLabelText(/Nombre/)).toHaveValue('Q1 repetido');
  });

  it('en edición de un ciclo activo bloquea las fechas y lo explica', () => {
    render(
      <ToastProvider>
        <CycleFormModal mode="edit" cycle={annual} onClose={() => {}} />
      </ToastProvider>,
    );
    expect(screen.getByLabelText(/Inicio/)).toBeDisabled();
    expect(
      screen.getByText(/solo se pueden cambiar mientras el ciclo está en borrador/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Umbral de comprometidos/)).toHaveValue('1,00');
    expect(screen.getByLabelText(/Umbral de aspiracionales/)).toHaveValue('0,70');
  });

  it('tras un error del servidor el tipo elegido sigue siendo el mismo (el form se resetea)', async () => {
    actions.createCycleAction.mockResolvedValue({
      status: 'error',
      message: 'Error',
      values: { kind: 'QUARTER', name: 'Q' },
    } satisfies FormState);
    render(
      <ToastProvider>
        <CycleFormModal mode="create" annuals={[annual]} onClose={() => {}} />
      </ToastProvider>,
    );
    await userEvent.selectOptions(screen.getByLabelText(/Tipo/), 'QUARTER');
    await userEvent.click(screen.getByRole('button', { name: 'Crear ciclo' }));
    await screen.findByRole('alert');

    expect(screen.getByLabelText(/Tipo/)).toHaveValue('QUARTER');
    expect(screen.getByLabelText(/Ciclo anual/)).toBeInTheDocument();
  });

  it('pide el ciclo anual cuando el tipo es trimestral', async () => {
    render(
      <ToastProvider>
        <CycleFormModal mode="create" annuals={[annual]} onClose={() => {}} />
      </ToastProvider>,
    );
    expect(screen.queryByLabelText(/Ciclo anual/)).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(/Tipo/), 'QUARTER');
    expect(screen.getByLabelText(/Ciclo anual/)).toBeInTheDocument();
  });
});
