import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RecognitionCard } from './recognition-card';
import { RecognitionForm } from './recognition-form';
import { RecognitionsWall, type WallItem } from './recognitions-wall';
import type { MilestoneOption } from '../milestones';

const createRecognitionAction = vi.hoisted(() => vi.fn());
vi.mock('../actions', () => ({ createRecognitionAction }));

const item = (over: Partial<WallItem> = {}): WallItem => ({
  id: 'r1',
  fromName: 'Dani Sosa',
  toName: 'Ana Pérez',
  message: 'Cerraste el trimestre con foco.',
  createdAt: '2026-03-02T15:30:00.000Z',
  milestone: { kind: 'kr', title: 'Clientes', objectiveTitle: 'Crecer', score: 0.85 },
  ...over,
});

describe('RecognitionCard', () => {
  it('muestra quién → a quién, el hito con banda y puntaje, y la fecha AR', () => {
    render(<RecognitionCard {...item()} />);
    expect(screen.getByText('Dani Sosa')).toBeVisible();
    expect(screen.getByText('Ana Pérez')).toBeVisible();
    expect(screen.getByLabelText('reconoció a')).toBeInTheDocument();
    const milestone = screen.getByTestId('recognition-milestone');
    expect(milestone).toHaveTextContent('Resultado clave: Clientes (Crecer)');
    expect(milestone).toHaveTextContent('En ruta');
    expect(milestone).toHaveTextContent('Puntaje 0,85');
    expect(screen.getByText('02/03/2026')).toBeVisible();
  });

  it('objetivo cerrado: palabra "Cerrado" y puntaje final', () => {
    render(
      <RecognitionCard
        {...item({ milestone: { kind: 'objective', title: 'Crecer', score: 0.55 } })}
      />,
    );
    expect(screen.getByTestId('recognition-milestone')).toHaveTextContent(
      'Objetivo cerrado: Crecer',
    );
    expect(screen.getByText('Cerrado')).toBeVisible();
  });

  it('hito no visible: lo dice sin filtrar títulos; sin enlace no hay bloque de hito', () => {
    const { rerender } = render(
      <RecognitionCard {...item({ milestone: { kind: 'unavailable' } })} />,
    );
    expect(screen.getByText(/ya no está disponible/)).toBeVisible();
    rerender(<RecognitionCard {...item({ milestone: null })} />);
    expect(screen.queryByTestId('recognition-milestone')).not.toBeInTheDocument();
  });
});

describe('RecognitionsWall', () => {
  const people = [
    { id: 'ana', name: 'Ana Pérez' },
    { id: 'dani', name: 'Dani Sosa' },
  ];

  it('lista, filtro por persona y SIN conteos ni rankings', () => {
    render(
      <RecognitionsWall items={[item(), item({ id: 'r2' })]} people={people} page={1} pages={1} />,
    );
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByLabelText('Filtrar por persona')).toBeVisible();
    expect(screen.queryByText(/ranking|top|más reconocid|total de/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Paginación' })).not.toBeInTheDocument();
  });

  it('paginado: Anterior/Siguiente conservan el filtro', () => {
    render(<RecognitionsWall items={[item()]} people={people} personId="ana" page={2} pages={3} />);
    const nav = screen.getByRole('navigation', { name: 'Paginación' });
    expect(within(nav).getByRole('link', { name: 'Anterior' })).toHaveAttribute(
      'href',
      '/reconocimientos?persona=ana',
    );
    expect(within(nav).getByRole('link', { name: 'Siguiente' })).toHaveAttribute(
      'href',
      '/reconocimientos?persona=ana&page=3',
    );
    expect(within(nav).getByText('Página 2 de 3')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Quitar filtro' })).toBeVisible();
  });

  it('muro vacío con copy', () => {
    render(<RecognitionsWall items={[]} people={people} page={1} pages={1} />);
    expect(screen.getByText('Todavía no hay reconocimientos')).toBeVisible();
  });
});

describe('RecognitionForm', () => {
  const milestones: MilestoneOption[] = [
    {
      value: 'kr:o1:k1',
      kind: 'kr',
      objectiveId: 'o1',
      keyResultId: 'k1',
      title: 'Clientes',
      objectiveTitle: 'Crecer',
      score: 0.7,
    },
    {
      value: 'obj:o2',
      kind: 'objective',
      objectiveId: 'o2',
      title: 'Cerrado',
      objectiveTitle: 'Cerrado',
      score: 0.5,
    },
  ];

  it('explica la regla del hito y lista los logros con puntaje', () => {
    render(<RecognitionForm toUserId="ana" toName="Ana Pérez" milestones={milestones} />);
    expect(screen.getByText(/0,70 o más, o un objetivo ya cerrado/)).toBeVisible();
    const select = screen.getByLabelText(/^Logro/);
    const labels = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(labels).toEqual([
      'Elegí un logro de Ana Pérez',
      'Resultado clave: Clientes (Crecer) · 0,70',
      'Objetivo cerrado: Cerrado · 0,50',
    ]);
  });

  it('envía persona oculta, logro y mensaje', async () => {
    createRecognitionAction.mockResolvedValue({ status: 'idle' });
    render(<RecognitionForm toUserId="ana" toName="Ana Pérez" milestones={milestones} />);
    await userEvent.selectOptions(screen.getByLabelText(/^Logro/), 'kr:o1:k1');
    await userEvent.type(screen.getByLabelText(/^Mensaje/), 'Excelente cierre');
    await userEvent.click(screen.getByRole('button', { name: 'Reconocer logro' }));
    const fd = createRecognitionAction.mock.calls[0][1] as FormData;
    expect(fd.get('toUserId')).toBe('ana');
    expect(fd.get('milestone')).toBe('kr:o1:k1');
    expect(fd.get('message')).toBe('Excelente cierre');
  });

  it('muestra el error del back (hito no alcanzado) y conserva el mensaje', async () => {
    createRecognitionAction.mockResolvedValue({
      status: 'error',
      message:
        'Ese logro todavía no es un hito: el resultado clave necesita un puntaje de 0,70 o más.',
      values: { milestone: 'kr:o1:k1', message: 'Mi texto' },
    });
    render(<RecognitionForm toUserId="ana" toName="Ana Pérez" milestones={milestones} />);
    await userEvent.type(screen.getByLabelText(/^Mensaje/), 'Mi texto');
    await userEvent.click(screen.getByRole('button', { name: 'Reconocer logro' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('todavía no es un hito');
    expect(screen.getByLabelText(/^Mensaje/)).toHaveValue('Mi texto');
  });
});
