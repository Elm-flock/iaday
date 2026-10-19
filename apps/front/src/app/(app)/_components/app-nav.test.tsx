import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppNav } from './app-nav';
import { AppShell } from '@/components/ui/app-shell';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

describe('AppNav', () => {
  it('marca Inicio como actual y habilita Check-ins, Feedback y Reconocimientos', () => {
    render(
      <AppShell sidebar={<AppNav />} header={<div />}>
        x
      </AppShell>,
    );

    expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');

    expect(screen.getByRole('link', { name: 'Check-ins' })).toHaveAttribute('href', '/check-ins');
    expect(screen.getByRole('link', { name: 'Feedback' })).toHaveAttribute('href', '/feedback');
    expect(screen.getByRole('link', { name: 'Reconocimientos' })).toHaveAttribute(
      'href',
      '/reconocimientos',
    );
  });

  it('habilita Objetivos, Equipos y Ciclos', () => {
    render(
      <AppShell sidebar={<AppNav role="MEMBER" />} header={<div />}>
        x
      </AppShell>,
    );
    expect(screen.getByRole('link', { name: 'Objetivos' })).toHaveAttribute('href', '/objetivos');
    expect(screen.getByRole('link', { name: 'Equipos' })).toHaveAttribute('href', '/equipos');
    expect(screen.getByRole('link', { name: 'Ciclos' })).toHaveAttribute('href', '/ciclos');
  });

  it('Ayuda: visible para todos, incluso sin rol conocido', () => {
    render(
      <AppShell sidebar={<AppNav />} header={<div />}>
        x
      </AppShell>,
    );
    expect(screen.getByRole('link', { name: 'Ayuda' })).toHaveAttribute('href', '/ayuda');
  });

  it('Usuarios: oculto sin rol conocido, habilitado para ADMIN y deshabilitado con explicación para el resto', () => {
    const { rerender } = render(
      <AppShell sidebar={<AppNav />} header={<div />}>
        x
      </AppShell>,
    );
    expect(screen.queryByText('Usuarios')).not.toBeInTheDocument();

    rerender(
      <AppShell sidebar={<AppNav role="ADMIN" />} header={<div />}>
        x
      </AppShell>,
    );
    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute(
      'href',
      '/admin/usuarios',
    );

    rerender(
      <AppShell sidebar={<AppNav role="LEADER" />} header={<div />}>
        x
      </AppShell>,
    );
    const item = screen.getByText('Usuarios').closest('[aria-disabled="true"]');
    expect(item).toBeInTheDocument();
    expect(item).toHaveAccessibleDescription('Solo administración puede gestionar usuarios.');
  });
});

describe('AppNav: Uso de IA (solo administración)', () => {
  it('oculto sin rol, enlace para ADMIN y deshabilitado con su propia explicación para el resto', () => {
    const { rerender } = render(
      <AppShell sidebar={<AppNav />} header={<div />}>
        x
      </AppShell>,
    );
    expect(screen.queryByText('Uso de IA')).not.toBeInTheDocument();

    rerender(
      <AppShell sidebar={<AppNav role="ADMIN" />} header={<div />}>
        x
      </AppShell>,
    );
    expect(screen.getByRole('link', { name: 'Uso de IA' })).toHaveAttribute(
      'href',
      '/admin/uso-ia',
    );

    rerender(
      <AppShell sidebar={<AppNav role="MEMBER" />} header={<div />}>
        x
      </AppShell>,
    );
    const item = screen.getByText('Uso de IA').closest('[aria-disabled="true"]');
    expect(item).toBeInTheDocument();
    expect(item).toHaveAccessibleDescription('Solo administración puede ver el uso de IA.');
  });
});

describe('AppNav: Auditoría y Pedidos de adaptación (solo administración) y Documentos adaptados (todas las personas)', () => {
  const renderNav = (role?: 'ADMIN' | 'MEMBER') =>
    render(
      <AppShell sidebar={<AppNav role={role} />} header={<div />}>
        x
      </AppShell>,
    );

  it('Documentos adaptados lo ve cualquier persona, incluso sin rol resuelto', () => {
    renderNav();
    expect(screen.getByRole('link', { name: 'Documentos adaptados' })).toHaveAttribute(
      'href',
      '/pedidos-adaptacion',
    );
  });

  it('ADMIN tiene enlaces; el resto los ve deshabilitados con su explicación', () => {
    const { unmount } = renderNav('ADMIN');
    expect(screen.getByRole('link', { name: 'Auditoría' })).toHaveAttribute(
      'href',
      '/admin/auditoria',
    );
    expect(screen.getByRole('link', { name: 'Pedidos de adaptación' })).toHaveAttribute(
      'href',
      '/admin/pedidos-adaptacion',
    );
    unmount();

    renderNav('MEMBER');
    for (const [name, reason] of [
      ['Auditoría', 'Solo administración puede ver la auditoría.'],
      ['Pedidos de adaptación', 'Solo administración puede gestionar los pedidos de adaptación.'],
    ]) {
      const item = screen.getByText(name).closest('[aria-disabled="true"]');
      expect(item).toBeInTheDocument();
      expect(item).toHaveAccessibleDescription(reason);
    }
  });
});

describe('AppNav contador de check-ins', () => {
  it('muestra los pendientes junto a Check-ins (como texto) y nada si no hay', () => {
    const { rerender } = render(
      <AppShell sidebar={<AppNav role="MEMBER" pendingCheckIns={3} />} header={<div />}>
        x
      </AppShell>,
    );
    expect(screen.getByRole('link', { name: /Check-ins/ })).toHaveTextContent('3 pendientes');
    expect(screen.getAllByTestId('nav-count')).toHaveLength(1);

    rerender(
      <AppShell sidebar={<AppNav role="MEMBER" pendingCheckIns={0} />} header={<div />}>
        x
      </AppShell>,
    );
    expect(screen.queryByTestId('nav-count')).not.toBeInTheDocument();
  });
});
