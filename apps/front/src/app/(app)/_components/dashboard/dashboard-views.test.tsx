import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminCard } from './admin-card';
import { FeedbackNote } from './feedback-note';
import { LeaderTeamsCard } from './leader-teams-card';
import { MyObjectivesCard } from './my-objectives-card';
import { PendingCard } from './pending-card';
import { dashboardPrimary } from './primary-action';
import { RecognitionsCard } from './recognitions-card';
import type { Objective } from '@/lib/dal/objectives';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

const objective = (over: Partial<Objective> = {}): Objective =>
  ({
    id: 'o1',
    title: 'Crecer en clientes',
    status: 'PUBLISHED',
    hasCheckIns: true,
    score: 0.75,
    keyResults: [
      { id: 'k1', hasCheckIns: true, overdue: false, score: 0.75 },
      { id: 'k2', hasCheckIns: false, overdue: false, score: 0 },
      { id: 'k3', hasCheckIns: true, overdue: false, score: 0.5 },
    ],
    ...over,
  }) as unknown as Objective;

describe('MyObjectivesCard', () => {
  it('con check-ins muestra banda, barra y "N de M KRs con check-in"', () => {
    render(
      <MyObjectivesCard individual={[objective()]} team={[]} cycleId="c1" primaryCreate={false} />,
    );
    expect(screen.getByText('En ruta')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Crecer en clientes' })).toHaveAttribute(
      'aria-valuetext',
      '0,75',
    );
    expect(screen.getByText('2 de 3 KRs con check-in')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Crecer en clientes/ })).toHaveAttribute(
      'href',
      '/objetivos/o1',
    );
  });

  it('estado neutro sin check-ins: sin banda ni barra', () => {
    const neutral = objective({
      hasCheckIns: false,
      score: 0,
      keyResults: [
        { id: 'k1', hasCheckIns: false, overdue: false, score: 0 },
      ] as Objective['keyResults'],
    });
    render(
      <MyObjectivesCard individual={[neutral]} team={[]} cycleId="c1" primaryCreate={false} />,
    );
    expect(screen.getByText('Sin check-ins')).toBeInTheDocument();
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
    expect(screen.queryByText(/En ruta|En riesgo|Requiere atención/)).not.toBeInTheDocument();
    expect(screen.getByText('0 de 1 KR con check-in')).toBeInTheDocument();
  });

  it('sin check-ins y con KR vencido muestra "Check-in vencido"', () => {
    const overdue = objective({
      hasCheckIns: false,
      keyResults: [
        { id: 'k1', hasCheckIns: false, overdue: true, score: 0 },
      ] as Objective['keyResults'],
    });
    render(
      <MyObjectivesCard individual={[overdue]} team={[]} cycleId="c1" primaryCreate={false} />,
    );
    expect(screen.getByText('Check-in vencido')).toBeInTheDocument();
  });

  it('un borrador no muestra puntaje', () => {
    render(
      <MyObjectivesCard
        individual={[objective({ status: 'DRAFT' })]}
        team={[]}
        cycleId="c1"
        primaryCreate={false}
      />,
    );
    expect(screen.getByText('Borrador')).toBeInTheDocument();
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
  });

  it('los objetivos de equipo van en un grupo aparte', () => {
    render(
      <MyObjectivesCard
        individual={[objective()]}
        team={[
          {
            teamName: 'Plataforma',
            objectives: [objective({ id: 'o2', title: 'Objetivo de equipo' })],
          },
        ]}
        cycleId="c1"
        primaryCreate={false}
      />,
    );
    const group = screen.getByRole('region', { name: 'Objetivos del equipo Plataforma' });
    expect(within(group).getByText('Objetivo de equipo')).toBeInTheDocument();
    const individual = screen.getByRole('region', { name: 'Objetivos individuales' });
    expect(within(individual).queryByText('Objetivo de equipo')).toBeNull();
  });

  it('vacío: CTA "Crear objetivo" hacia el ciclo, primaria solo si corresponde', () => {
    const { rerender } = render(
      <MyObjectivesCard individual={[]} team={[]} cycleId="c1" primaryCreate />,
    );
    const cta = screen.getByRole('link', { name: 'Crear objetivo' });
    expect(cta).toHaveAttribute('href', '/objetivos/nuevo?cycleId=c1');
    expect(cta.className).toContain('bg-primary');
    rerender(<MyObjectivesCard individual={[]} team={[]} cycleId="c1" primaryCreate={false} />);
    expect(screen.getByRole('link', { name: 'Crear objetivo' }).className).not.toContain(
      'bg-primary ',
    );
  });
});

describe('PendingCard', () => {
  const item = (n: number) => ({
    keyResultId: `k${n}`,
    keyResultTitle: `KR ${n}`,
    objectiveId: `o${n}`,
    objectiveTitle: `Objetivo ${n}`,
    cadence: 'WEEKLY' as const,
    lastCheckInAt: null,
    referenceAt: '2026-10-01T10:00:00Z',
  });

  it('vacío: "Estás al día con tus check-ins." y ninguna acción', () => {
    render(<PendingCard total={0} top={[]} />);
    expect(screen.getByText('Estás al día con tus check-ins.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Registrar check-in' })).not.toBeInTheDocument();
  });

  it('con pendientes: cantidad, KRs con "Check-in vencido" y la primaria "Registrar check-in"', () => {
    render(<PendingCard total={7} top={[item(1), item(2)]} />);
    expect(screen.getByTestId('pending-count')).toHaveTextContent('7 vencidos');
    expect(screen.getAllByText('Check-in vencido')).toHaveLength(2);
    expect(screen.getByText('Y 5 más en la lista completa.')).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: 'Registrar check-in' });
    expect(cta).toHaveAttribute('href', '/check-ins');
    expect(cta.className).toContain('bg-primary');
  });
});

describe('RecognitionsCard', () => {
  const r = (id: string, from: string, to: string) => ({
    id,
    fromName: from,
    toName: to,
    message: `Mensaje ${id}`,
    createdAt: '2026-10-01T10:00:00Z',
  });

  it('muestra lo que recibí y el muro, sin conteos por persona', () => {
    render(<RecognitionsCard received={[r('a', 'Beto', 'Ana')]} wall={[r('b', 'Ana', 'Carla')]} />);
    expect(
      within(screen.getByRole('region', { name: 'Para vos' })).getByText('Mensaje a'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'En el muro' })).getByText('Mensaje b'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ranking|total|\d+ reconocimientos/i)).not.toBeInTheDocument();
  });

  it('vacío total: estado vacío; solo el muro: avisa que no recibiste', () => {
    const { rerender } = render(<RecognitionsCard received={[]} wall={[]} />);
    expect(screen.getByText('Todavía no hay reconocimientos')).toBeInTheDocument();
    rerender(<RecognitionsCard received={[]} wall={[r('b', 'Ana', 'Carla')]} />);
    expect(screen.getByText('Todavía no recibiste reconocimientos.')).toBeInTheDocument();
  });
});

describe('FeedbackNote', () => {
  it('muestra solo el conteo y un enlace a /feedback, nunca contenido', () => {
    const { container } = render(<FeedbackNote unread={1} />);
    expect(screen.getByText('Tenés 1 feedback sin leer.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a mi feedback' })).toHaveAttribute(
      'href',
      '/feedback',
    );
    expect(container.textContent).toBe('Tenés 1 feedback sin leer.Ir a mi feedback');
  });

  it('sin feedback sin leer no renderiza nada', () => {
    const { container } = render(<FeedbackNote unread={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('LeaderTeamsCard', () => {
  it('muestra el 50/50 de cada equipo con ícono + palabra y enlace al equipo con el ciclo', () => {
    render(
      <LeaderTeamsCard
        cycleId="c1"
        teams={[
          {
            id: 't1',
            name: 'Plataforma',
            originMix: { topDown: 2, bottomUp: 2, bottomUpRatio: 0.5, warning: false },
          },
          {
            id: 't2',
            name: 'Datos',
            originMix: { topDown: 1, bottomUp: 4, bottomUpRatio: 0.8, warning: true },
          },
          {
            id: 't3',
            name: 'Nuevo',
            originMix: { topDown: 0, bottomUp: 0, bottomUpRatio: null, warning: false },
          },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: /Plataforma/ })).toHaveAttribute(
      'href',
      '/equipos/t1?cycleId=c1',
    );
    expect(screen.getByText('Top-down 50 % · Bottom-up 50 %')).toBeInTheDocument();
    expect(screen.getByText('Equilibrado')).toBeInTheDocument();
    expect(screen.getByText('Fuera del rango 40–60 %')).toBeInTheDocument();
    expect(screen.getByText('Sin objetivos en este ciclo')).toBeInTheDocument();
  });
});

describe('AdminCard', () => {
  it('muestra el ciclo activo y los accesos rápidos', () => {
    render(
      <AdminCard cycle={{ name: 'Q4 2026', startDate: '2026-10-01', endDate: '2026-12-31' }} />,
    );
    expect(screen.getByText('Ciclo activo')).toBeInTheDocument();
    expect(screen.getByText(/Q4 2026 · 01\/10\/2026–31\/12\/2026/)).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Accesos de administración' });
    expect(within(nav).getByRole('link', { name: 'Ciclos' })).toHaveAttribute('href', '/ciclos');
    expect(within(nav).getByRole('link', { name: 'Equipos' })).toHaveAttribute('href', '/equipos');
    expect(within(nav).getByRole('link', { name: 'Usuarios' })).toHaveAttribute(
      'href',
      '/admin/usuarios',
    );
  });

  it('sin ciclo activo lo dice', () => {
    render(<AdminCard cycle={undefined} />);
    expect(screen.getByText('Sin ciclo activo')).toBeInTheDocument();
  });
});

describe('dashboardPrimary', () => {
  it('pendientes ganan; sin pendientes y sin objetivos, crear; si no, ninguna', () => {
    expect(dashboardPrimary({ pendingTotal: 2, individualObjectives: 0 })).toBe(
      'register-check-in',
    );
    expect(dashboardPrimary({ pendingTotal: 0, individualObjectives: 0 })).toBe('create-objective');
    expect(dashboardPrimary({ pendingTotal: 0, individualObjectives: 3 })).toBeNull();
  });
});
