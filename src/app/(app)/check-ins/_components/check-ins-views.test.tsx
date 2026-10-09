import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CheckInDrawer } from './check-in-drawer';
import { CheckInTimeline } from './check-in-timeline';
import type { CheckInTarget } from './check-in-target';
import { groupByObjective, PendingListView } from './pending-list-view';
import { ToastProvider } from '@/components/ui/toast';

const createCheckInAction = vi.hoisted(() => vi.fn());
vi.mock('../actions', () => ({ createCheckInAction }));

const target = (over: Partial<CheckInTarget> = {}): CheckInTarget => ({
  objectiveId: 'o1',
  krId: 'k1',
  title: 'Llegar a 100 clientes',
  scoring: 'DERIVED',
  unit: 'clientes',
  startValue: '0',
  targetValue: '100',
  currentValue: '20',
  score: 0.2,
  ...over,
});

const open = (t: CheckInTarget) =>
  render(
    <ToastProvider>
      <CheckInDrawer target={t} onClose={() => {}} />
    </ToastProvider>,
  );

const preview = () => screen.getByTestId('check-in-preview');

describe('CheckInDrawer', () => {
  it('explica cada acción y muestra la unidad del KR numérico', () => {
    open(target());
    const dialog = screen.getByRole('dialog', { name: 'Registrar check-in' });
    for (const label of ['Continuar', 'Actualizar', 'Iniciar', 'Detener']) {
      expect(within(dialog).getByRole('radio', { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(within(dialog).getByText(/Seguimos igual/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Valor actual \(clientes\)/)).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: /Actualizar/ })).toBeChecked();
  });

  it('previsualiza score y banda mientras se escribe (formato AR)', async () => {
    open(target());
    expect(preview()).toHaveTextContent('Ingresá el valor actual');
    await userEvent.type(screen.getByLabelText(/Valor actual/), '72');
    expect(preview()).toHaveTextContent('En ruta');
    expect(preview()).toHaveTextContent('0,72');
  });

  it('meta menor al inicio: el avance va hacia abajo', async () => {
    open(target({ startValue: '100', targetValue: '0' }));
    await userEvent.type(screen.getByLabelText(/Valor actual/), '30');
    expect(preview()).toHaveTextContent('En ruta');
    expect(preview()).toHaveTextContent('0,70');
  });

  it('recorta el score a 0 y 1', async () => {
    open(target());
    const input = screen.getByLabelText(/Valor actual/);
    await userEvent.type(input, '500');
    expect(preview()).toHaveTextContent('1,00');
    await userEvent.clear(input);
    await userEvent.type(input, '-20');
    expect(preview()).toHaveTextContent('0,00');
    expect(preview()).toHaveTextContent('En riesgo');
  });

  it('KR manual: selector 0,0 a 1,0 en pasos de 0,1 y preview', async () => {
    open(target({ scoring: 'MANUAL', unit: null, startValue: null, targetValue: null }));
    const select = screen.getByLabelText(/^Puntaje/);
    expect(within(select).getAllByRole('option')).toHaveLength(11);
    expect(within(select).getByRole('option', { name: '0,0' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: '1,0' })).toBeInTheDocument();
    await userEvent.selectOptions(select, '0.4');
    expect(preview()).toHaveTextContent('Requiere atención');
    expect(screen.queryByLabelText(/Valor actual/)).not.toBeInTheDocument();
  });

  it('muestra el error del back en español y no pierde lo tipeado', async () => {
    createCheckInAction.mockResolvedValue({
      status: 'error',
      message: 'El objetivo ya está cerrado y no admite check-ins.',
      values: { action: 'UPDATE', value: '10' },
    });
    open(target());
    await userEvent.type(screen.getByLabelText(/Valor actual/), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar check-in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ya está cerrado');
    expect(screen.getByLabelText(/Valor actual/)).toHaveValue('10');
  });
});

describe('CheckInTimeline', () => {
  const names = new Map([['u1', 'Ana']]);
  it('lista fecha, autor, acción, valor, score, banda y nota', () => {
    render(
      <CheckInTimeline
        unit="clientes"
        names={names}
        checkIns={[
          {
            id: 'c1',
            keyResultId: 'k1',
            authorId: 'u1',
            action: 'UPDATE',
            value: '1500.5',
            score: 0.35,
            band: 'RED',
            note: 'Cerró el trimestre fuerte',
            createdAt: '2026-03-05T15:32:00.000Z',
          },
        ]}
      />,
    );
    expect(screen.getByText('05/03/2026 12:32')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Actualizar')).toBeInTheDocument();
    expect(screen.getByText(/1\.500,50 clientes/)).toBeInTheDocument();
    expect(screen.getByText('Score 0,35')).toBeInTheDocument();
    expect(screen.getByText('En riesgo')).toBeInTheDocument();
    expect(screen.getByText('Cerró el trimestre fuerte')).toBeInTheDocument();
  });
  it('sin check-ins lo dice', () => {
    render(<CheckInTimeline checkIns={[]} names={names} unit={null} />);
    expect(screen.getByText('Todavía no hay check-ins.')).toBeInTheDocument();
  });
});

describe('PendingListView', () => {
  it('estado vacío: "Estás al día con tus check-ins."', () => {
    render(<PendingListView groups={[]} />);
    expect(screen.getByText('Estás al día con tus check-ins.')).toBeInTheDocument();
  });

  it('agrupa por objetivo y ofrece "Registrar check-in" con aviso de vencido', () => {
    const item = (krId: string, last: string | null) => ({
      objectiveId: 'o1',
      objectiveTitle: 'Crecer en cuentas',
      target: target({ krId, title: `KR ${krId}` }),
      cadence: 'WEEKLY' as const,
      lastCheckInAt: last,
      referenceAt: '2026-02-01T12:00:00.000Z',
    });
    const groups = groupByObjective([item('a', '2026-02-10T12:00:00.000Z'), item('b', null)]);
    expect(groups).toHaveLength(1);
    render(
      <ToastProvider>
        <PendingListView groups={groups} />
      </ToastProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Crecer en cuentas' })).toBeInTheDocument();
    expect(screen.getAllByText('Check-in vencido')).toHaveLength(2);
    expect(screen.getByText(/Último check-in: 10\/02\/2026/)).toBeInTheDocument();
    expect(
      screen.getByText(/Sin check-ins desde la publicación \(01\/02\/2026\)/),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Registrar check-in de KR/ })).toHaveLength(2);
  });
});
