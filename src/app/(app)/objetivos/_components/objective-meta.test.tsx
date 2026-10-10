import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FinalResult } from './objective-meta';

describe('FinalResult', () => {
  it('objetivo cerrado y logrado: puntaje final y la palabra Logrado', () => {
    render(<FinalResult objective={{ status: 'CLOSED', finalScore: 0.8, achieved: true }} />);
    expect(screen.getByTestId('final-result')).toHaveTextContent('Puntaje final 0,80');
    expect(screen.getByText('Logrado')).toBeInTheDocument();
  });

  it('cerrado sin alcanzar el umbral: No logrado', () => {
    render(<FinalResult objective={{ status: 'CLOSED', finalScore: 0.55, achieved: false }} />);
    expect(screen.getByText('No logrado')).toBeInTheDocument();
  });

  it('no se muestra si el objetivo no está cerrado', () => {
    const { container } = render(
      <FinalResult objective={{ status: 'PUBLISHED', finalScore: null, achieved: null }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
