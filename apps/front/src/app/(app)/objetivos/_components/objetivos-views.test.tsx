import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { KeyResultsCard } from './key-results-card';
import { KrFormModal } from './kr-form-modal';
import { LimitIndicator } from './objective-meta';
import { groupByOwner, ObjectivesListView } from './objectives-list-view';
import { ToastProvider } from '@/components/ui/toast';
import type { KeyResult, Objective } from '@/lib/dal/objectives';

vi.mock('../actions', () => ({
  createKeyResultAction: vi.fn(),
  updateKeyResultAction: vi.fn(),
  deleteKeyResultAction: vi.fn(),
}));

const kr = (over: Partial<KeyResult> = {}): KeyResult => ({
  id: 'k1',
  objectiveId: 'o1',
  ownerId: 'u1',
  title: 'Llegar a 100 clientes',
  scoring: 'DERIVED',
  startValue: '0',
  targetValue: '100',
  currentValue: '70',
  unit: 'clientes',
  score: 0.7,
  position: 1,
  lastCheckInAt: '2026-01-05T12:00:00.000Z',
  hasCheckIns: true,
  overdue: false,
  ...over,
});

const objective = (over: Partial<Objective> = {}): Objective =>
  ({
    id: 'o1',
    title: 'Crecer en cuentas',
    status: 'PUBLISHED',
    type: 'COMMITTED',
    origin: 'TOP_DOWN',
    ownerUserId: 'u1',
    ownerTeamId: null,
    score: 0.7,
    hasCheckIns: true,
    keyResults: [kr(), kr({ id: 'k2' })],
    ...over,
  }) as Objective;

const people = [{ id: 'u1', name: 'Mica' }];

const wrap = (ui: React.ReactNode) => render(<ToastProvider>{ui}</ToastProvider>);

describe('LimitIndicator', () => {
  it('muestra "4 de 5 objetivos" cuando el conteo es exacto', () => {
    render(<LimitIndicator count={4} exact />);
    expect(screen.getByTestId('limit-indicator')).toHaveTextContent('4 de 5 objetivos');
    expect(screen.queryByText('Llegó al máximo')).not.toBeInTheDocument();
  });

  it('al llegar a 5 avisa con ícono y palabra', () => {
    render(<LimitIndicator count={5} exact />);
    expect(screen.getByText('Llegó al máximo')).toBeInTheDocument();
  });

  it('con menos de 3 indica cuántos faltan para publicar', () => {
    render(<LimitIndicator count={2} exact />);
    expect(screen.getByText('Faltan 1 para publicar')).toBeInTheDocument();
  });

  it('si no se ven los borradores no afirma un cupo', () => {
    render(<LimitIndicator count={2} exact={false} />);
    expect(screen.getByText('2 objetivos publicados')).toBeInTheDocument();
    expect(screen.queryByTestId('limit-indicator')).not.toBeInTheDocument();
  });
});

describe('ObjectivesListView', () => {
  const objectives = [
    objective({ id: 'a', title: 'B objetivo' }),
    objective({ id: 'b', title: 'A objetivo' }),
    objective({
      id: 'c',
      title: 'Del equipo',
      ownerUserId: null,
      ownerTeamId: 't1',
      status: 'DRAFT',
    }),
  ];
  const names: Record<string, string> = { 'user:u1': 'Mica', 'team:t1': 'Plataforma' };

  it('agrupa por responsable (equipos primero) con cupo, etiquetas, banda y score', () => {
    const groups = groupByOwner(
      objectives,
      (k) => names[k],
      new Map([
        ['user:u1', 4],
        ['team:t1', 1],
      ]),
      (o) => o.ownerUserId === 'u1',
    );
    expect(groups.map((g) => g.name)).toEqual(['Plataforma', 'Mica']);
    expect(groups[1].objectives.map((o) => o.title)).toEqual(['A objetivo', 'B objetivo']);

    render(<ObjectivesListView groups={groups} hasFilters={false} />);
    expect(screen.getByText('4 de 5 objetivos')).toBeInTheDocument();
    expect(screen.getByText('1 objetivo publicado')).toBeInTheDocument(); // equipo: sin borradores visibles
    expect(screen.getAllByText('Comprometido').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Top-down').length).toBeGreaterThan(0);
    expect(screen.getAllByText('En ruta').length).toBe(2);
    expect(screen.getAllByText('2 resultados clave').length).toBe(3);
    expect(screen.getByText('Borrador')).toBeInTheDocument();
  });

  it('sin resultados explica por qué y qué hacer', () => {
    render(<ObjectivesListView groups={[]} hasFilters />);
    expect(screen.getByText('No hay objetivos con estos filtros')).toBeInTheDocument();
  });
});

describe('KeyResultsCard', () => {
  it('lista inicio, meta, actual, unidad, score y banda con formato AR', () => {
    wrap(
      <KeyResultsCard
        objective={{ id: 'o1', status: 'PUBLISHED' }}
        keyResults={[kr({ targetValue: '1500.5', score: 0.35 })]}
        people={people}
        viewerId="u1"
        canEdit
        canChangeTarget
        checkInReasons={{}}
      />,
    );
    const row = screen.getByRole('row', { name: /Llegar a 100 clientes/ });
    expect(within(row).getByText('1.500,50')).toBeInTheDocument();
    expect(within(row).getByText('clientes')).toBeInTheDocument();
    expect(within(row).getByText('0,35')).toBeInTheDocument();
    expect(within(row).getByText('En riesgo')).toBeInTheDocument();
  });

  it('tras publicar no se pueden quitar KRs y se dice por qué', () => {
    wrap(
      <KeyResultsCard
        objective={{ id: 'o1', status: 'PUBLISHED' }}
        keyResults={[kr()]}
        people={people}
        viewerId="u1"
        canEdit
        checkInReasons={{}}
        canChangeTarget={false}
      />,
    );
    expect(screen.getByRole('button', { name: /^Quitar Llegar a 100 clientes/ })).toBeDisabled();
    expect(screen.getByText(/no se pueden quitar resultados clave/)).toBeInTheDocument();
  });

  it('en borrador permite agregar hasta 5 y después explica el límite', () => {
    const five = Array.from({ length: 5 }, (_, i) => kr({ id: `k${i}`, title: `KR ${i}` }));
    wrap(
      <KeyResultsCard
        objective={{ id: 'o1', status: 'DRAFT' }}
        keyResults={five}
        people={people}
        viewerId="u1"
        canEdit
        checkInReasons={{}}
        canChangeTarget={false}
      />,
    );
    const add = screen.getByRole('button', { name: 'Agregar resultado clave' });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription(/máximo de 5/);
  });

  it('quien no edita no ve acciones', () => {
    wrap(
      <KeyResultsCard
        objective={{ id: 'o1', status: 'PUBLISHED' }}
        keyResults={[kr()]}
        people={people}
        viewerId="otro"
        canEdit={false}
        checkInReasons={{}}
        canChangeTarget={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Agregar resultado clave' }),
    ).not.toBeInTheDocument();
  });
});

describe('KrFormModal', () => {
  it('al editar un KR publicado sin permiso, inicio y meta están deshabilitados con la razón', () => {
    wrap(
      <KrFormModal
        objectiveId="o1"
        people={people}
        defaultOwnerId="u1"
        targetLocked
        keyResult={kr()}
        onClose={() => {}}
      />,
    );
    expect(screen.getByLabelText(/Meta/)).toBeDisabled();
    expect(screen.getByLabelText(/Valor inicial/)).toBeDisabled();
    expect(screen.getByTestId('target-locked-reason')).toHaveTextContent(
      /solo el líder o administración pueden cambiar el inicio y la meta/,
    );
  });

  it('al agregar un KR nuevo, inicio y meta siempre se pueden completar', () => {
    wrap(
      <KrFormModal
        objectiveId="o1"
        people={people}
        defaultOwnerId="u1"
        targetLocked
        onClose={() => {}}
      />,
    );
    expect(screen.getByLabelText(/Meta/)).toBeEnabled();
  });

  it('un KR manual no pide inicio ni meta', async () => {
    wrap(
      <KrFormModal
        objectiveId="o1"
        people={people}
        defaultOwnerId="u1"
        targetLocked={false}
        onClose={() => {}}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText(/Cómo se mide/), 'MANUAL');
    expect(screen.queryByLabelText(/Meta/)).not.toBeInTheDocument();
  });
});
