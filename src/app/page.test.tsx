import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Home from './page';

describe('Home', () => {
  it('renderiza el heading principal y los links de documentación', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { level: 1, name: /edit the/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /documentation/i })).toHaveAttribute(
      'href',
      expect.stringContaining('nextjs.org/docs'),
    );
  });
});
