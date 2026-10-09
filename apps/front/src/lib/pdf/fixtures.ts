import type { ReportKeyResultDto, ReportObjectiveDto, TeamReportDto } from './report-types';

/** Fixtures compartidos por los tests del PDF (no se importan desde código de producción). */
export function kr(over: Partial<ReportKeyResultDto> = {}): ReportKeyResultDto {
  return {
    id: 'kr-1',
    title: 'Llegar a 100 clientes',
    scoring: 'DERIVED',
    unit: 'clientes',
    startValue: '0',
    targetValue: '100',
    currentValue: '80',
    score: 0.8,
    band: 'GREEN',
    lastCheckInAt: '2026-03-10T15:00:00.000Z',
    ...over,
  };
}

export function objective(over: Partial<ReportObjectiveDto> = {}): ReportObjectiveDto {
  return {
    id: 'obj-1',
    title: 'Crecer en el mercado',
    type: 'COMMITTED',
    origin: 'BOTTOM_UP',
    status: 'PUBLISHED',
    score: 0.8,
    band: 'GREEN',
    finalScore: null,
    achieved: null,
    keyResults: [kr()],
    ...over,
  };
}

export function report(over: Partial<TeamReportDto> = {}): TeamReportDto {
  return {
    team: { id: 'team-1', name: 'Plataforma Núcleo' },
    cycle: {
      id: 'cycle-1',
      name: 'Q1 2026',
      kind: 'QUARTER',
      status: 'ACTIVE',
      committedThreshold: 1,
      aspirationalThreshold: 0.7,
    },
    generatedAt: '2026-03-15T12:00:00.000Z',
    originMix: { topDown: 1, bottomUp: 1, bottomUpRatio: 0.5, warning: false },
    teamObjectives: [objective({ id: 'team-obj', origin: 'TOP_DOWN' })],
    members: [
      { userId: 'u-zoe', name: 'Zoe Álvarez', objectives: [objective({ id: 'o-zoe', score: 1 })] },
      { userId: 'u-ana', name: 'Ana Pérez', objectives: [] },
      { userId: 'u-oscar', name: 'Óscar Díaz', objectives: [objective({ id: 'o-oscar' })] },
    ],
    ...over,
  };
}
