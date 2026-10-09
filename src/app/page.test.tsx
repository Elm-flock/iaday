import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Home from './page';

describe('Home', () => {
  it('renderiza el heading principal', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { level: 1, name: 'OKR Platform' })).toBeInTheDocument();
  });
});
