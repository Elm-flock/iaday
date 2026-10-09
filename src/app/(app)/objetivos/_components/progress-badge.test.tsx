import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  KrProgressBadge,
  ObjectiveProgressBadge,
  krProgressState,
  objectiveProgressState,
} from './progress-badge';

const kr = (over = {}) => ({ hasCheckIns: false, overdue: false, score: 0, ...over });

describe('estado neutro de KRs y objetivos', () => {
  it('sin check-ins: "Sin check-ins" (ícono + palabra), sin banda', () => {
    render(<KrProgressBadge kr={kr()} />);
    expect(screen.getByText('Sin check-ins')).toBeInTheDocument();
    expect(screen.queryByText(/En ruta|Requiere atención|En riesgo/)).not.toBeInTheDocument();
  });

  it('sin check-ins y vencido: "Check-in vencido" en lugar del neutro', () => {
    render(<KrProgressBadge kr={kr({ overdue: true })} />);
    expect(screen.getByText('Check-in vencido')).toBeInTheDocument();
    expect(screen.queryByText('Sin check-ins')).not.toBeInTheDocument();
  });

  it.each([
    [0.8, 'En ruta'],
    [0.5, 'Requiere atención'],
    [0.1, 'En riesgo'],
  ])('con check-ins aparece la banda (score %s -> %s)', (score, label) => {
    render(<KrProgressBadge kr={kr({ hasCheckIns: true, score })} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText('Sin check-ins')).not.toBeInTheDocument();
  });

  it('con check-ins y vencido muestra banda y aviso de vencido', () => {
    render(<KrProgressBadge kr={kr({ hasCheckIns: true, score: 0.8, overdue: true })} />);
    expect(screen.getByText('En ruta')).toBeInTheDocument();
    expect(screen.getByText('Check-in vencido')).toBeInTheDocument();
  });

  it('objetivo: neutro, vencido si algún KR lo está y banda cuando hay datos', () => {
    const base = { hasCheckIns: false, score: 0, keyResults: [kr() as never] };
    expect(objectiveProgressState(base)).toEqual({ kind: 'neutral' });
    expect(
      objectiveProgressState({ ...base, keyResults: [kr({ overdue: true }) as never] }),
    ).toEqual({ kind: 'overdue' });
    expect(objectiveProgressState({ ...base, hasCheckIns: true, score: 0.7 })).toMatchObject({
      kind: 'banded',
      score: 0.7,
    });
    expect(krProgressState(kr({ hasCheckIns: true, score: 0.2 }))).toMatchObject({
      kind: 'banded',
    });
    render(<ObjectiveProgressBadge objective={{ ...base, hasCheckIns: true, score: 0.7 }} />);
    expect(screen.getByText('En ruta')).toBeInTheDocument();
  });
});
