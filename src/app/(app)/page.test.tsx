import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DashboardPage from './page';

// Las cards async (Server Components) se cubren con DAL + e2e; acá solo la cabecera estática.
vi.mock('./_components/dashboard/sections', () => ({
  DashboardSections: () => <div data-testid="sections" />,
}));

describe('Dashboard (Inicio)', () => {
  it('muestra el título y delega las cards en secciones con su propio Suspense', () => {
    render(<DashboardPage searchParams={Promise.resolve({})} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Inicio' })).toBeInTheDocument();
    expect(screen.getByTestId('sections')).toBeInTheDocument();
  });
});
