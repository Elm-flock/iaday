import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppNav } from './app-nav';
import { AppShell } from '@/components/ui/app-shell';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

describe('AppNav', () => {
  it('marca Inicio como actual y explica por qué los módulos futuros están deshabilitados', () => {
    render(
      <AppShell sidebar={<AppNav />} header={<div />}>
        x
      </AppShell>,
    );

    expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');

    const checkIns = screen.getByText('Check-ins').closest('[aria-disabled="true"]');
    expect(checkIns).toBeInTheDocument();
    expect(checkIns).toHaveAccessibleDescription(/todavía no está disponible/i);
    for (const label of ['Feedback', 'Reconocimientos']) {
      expect(screen.getByText(label).closest('[aria-disabled="true"]')).toBeInTheDocument();
    }
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
