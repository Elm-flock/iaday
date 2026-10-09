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

    const objetivos = screen.getByText('Objetivos').closest('[aria-disabled="true"]');
    expect(objetivos).toBeInTheDocument();
    expect(objetivos).toHaveAccessibleDescription(/todavía no está disponible/i);
    for (const label of ['Check-ins', 'Equipos', 'Ciclos', 'Feedback', 'Reconocimientos']) {
      expect(screen.getByText(label).closest('[aria-disabled="true"]')).toBeInTheDocument();
    }
  });
});
