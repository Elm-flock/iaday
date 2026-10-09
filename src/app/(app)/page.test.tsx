import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DashboardPage from './page';

describe('Dashboard (placeholder)', () => {
  it('muestra el título y el estado vacío', () => {
    render(<DashboardPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Inicio' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /todavía no hay nada/i })).toBeInTheDocument();
  });
});
