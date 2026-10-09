import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DownloadReportButton } from './download-report-button';
import { OriginMixIndicator } from './origin-mix-indicator';
import { TeamTreeView } from './team-tree-view';
import { MembersManager } from './members-manager';
import { ToastProvider } from '@/components/ui/toast';

vi.mock('../actions', () => ({
  addMemberAction: vi.fn(),
  setLeadAction: vi.fn(),
  removeMemberAction: vi.fn(),
}));

describe('OriginMixIndicator', () => {
  it('sin ciclo elegido pide elegir uno', () => {
    render(<OriginMixIndicator mix={null} />);
    expect(screen.getByText(/Elegí un ciclo/)).toBeInTheDocument();
  });

  it('sin objetivos no muestra porcentajes', () => {
    render(
      <OriginMixIndicator mix={{ topDown: 0, bottomUp: 0, bottomUpRatio: null, warning: false }} />,
    );
    const copy = screen.getByText(/Todavía no hay objetivos/);
    expect(copy).toHaveTextContent(/ni del equipo ni individuales de sus integrantes/);
  });

  it('50/50 se muestra equilibrado', () => {
    render(
      <OriginMixIndicator mix={{ topDown: 2, bottomUp: 2, bottomUpRatio: 0.5, warning: false }} />,
    );
    expect(screen.getByText('Equilibrado')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Top-down 50 %, bottom-up 50 %/ })).toBeInTheDocument();
    expect(screen.queryByText(/Es solo un aviso/)).not.toBeInTheDocument();
  });

  it('fuera de 40–60 % avisa con ícono y palabra, y aclara que no bloquea', () => {
    render(
      <OriginMixIndicator mix={{ topDown: 1, bottomUp: 4, bottomUpRatio: 0.8, warning: true }} />,
    );
    const badge = screen.getByText('Fuera del rango 40–60 %');
    expect(badge.querySelector('svg')).not.toBeNull();
    expect(screen.getByText(/Es solo un aviso/)).toBeInTheDocument();
    expect(screen.getByText(/80 % · 4 objetivos/)).toBeInTheDocument();
  });
});

describe('TeamTreeView', () => {
  it('renderiza el árbol anidado con links al detalle', () => {
    render(
      <TeamTreeView
        tree={[
          {
            id: 'org',
            name: 'Flock',
            parentId: null,
            children: [{ id: 'eng', name: 'Ingeniería', parentId: 'org', children: [] }],
          },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Ingeniería' })).toHaveAttribute(
      'href',
      '/equipos/eng',
    );
  });
});

describe('MembersManager', () => {
  const members = [
    { userId: 'u1', name: 'Ana Admin', isLead: true },
    { userId: 'u2', name: 'Beto Pérez', isLead: false },
  ];

  it('muestra la insignia de líder con ícono y palabra', () => {
    render(
      <ToastProvider>
        <MembersManager teamId="t" members={members} candidates={[]} canManage={false} />
      </ToastProvider>,
    );
    expect(screen.getByText('Líder')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Agregar integrante/ })).not.toBeInTheDocument();
  });

  it('con permisos ofrece gestionar; sin candidatos explica por qué no se puede agregar', () => {
    render(
      <ToastProvider>
        <MembersManager teamId="t" members={members} candidates={[]} canManage />
      </ToastProvider>,
    );
    expect(screen.getByRole('button', { name: 'Agregar integrante' })).toBeDisabled();
    expect(screen.getByText(/Todas las personas activas ya están/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar liderazgo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hacer líder' })).toBeInTheDocument();
  });
});

describe('DownloadReportButton', () => {
  it('con ciclo es un enlace de descarga al Route Handler', () => {
    render(<DownloadReportButton teamId="t1" cycleId="c1" />);
    const link = screen.getByRole('link', { name: 'Descargar reporte PDF' });
    expect(link).toHaveAttribute('href', '/api/reports/teams/t1/pdf?cycleId=c1');
    expect(link).toHaveAttribute('download');
  });

  it('sin ciclo está deshabilitado y explica por qué', () => {
    render(<DownloadReportButton teamId="t1" cycleId={undefined} />);
    expect(screen.getByRole('button', { name: 'Descargar reporte PDF' })).toBeDisabled();
    expect(screen.getByText('Elegí un ciclo para descargar el reporte.')).toBeInTheDocument();
  });
});
