import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ImpactTiles } from './_components/impact-tiles';
import { RangeFilter } from './_components/range-filter';
import { FailuresTable, UsageTable } from './_components/usage-table';
import type { AiImpact, AiUsage } from '@/lib/dal/ai';

const row = (over: Partial<AiUsage['byFeature'][number]> = {}) => ({
  key: 'ADAPT',
  calls: 1234,
  failedCalls: 12,
  inputTokens: 1_500_000,
  outputTokens: 800_000,
  costUsdEst: 1.8123,
  latencyP50Ms: 2300,
  latencyP95Ms: 9100,
  fallbackRate: 0.025,
  ...over,
});

const impact: AiImpact = {
  from: '2026-09-18T00:00:00.000Z',
  to: '2026-10-18T00:00:00.000Z',
  adoption: {
    adaptationAcceptanceRate: 0.8,
    adaptationsAccepted: 8,
    adaptationsTotal: 10,
    suggestionAcceptanceRate: null,
    suggestionsAccepted: 0,
    suggestionsTotal: 0,
  },
  time: { adaptationLatencyP50Ms: 2100, decisionTimeP50Ms: null },
  quality: { meanReadabilityDelta: 12.34, needsReviewRate: 0.1 },
  cost: {
    activeUsers: 5,
    costPerActiveUserUsdEst: 0.0036,
    totalCostUsdEst: 0.018,
    byFeature: [{ feature: 'ADAPT', costUsdEst: 0.0123 }],
  },
};

describe('UsageTable', () => {
  it('muestra tokens, latencias y fallback en es-AR y aclara que el costo es una estimación', () => {
    render(<UsageTable title="Uso por función" keyHeader="Función" rows={[row()]} humanizeKey />);
    const table = screen.getByRole('table', { name: 'Uso por función' });
    expect(within(table).getByRole('rowheader', { name: 'Versión accesible' })).toBeInTheDocument();
    expect(within(table).getByText('1.234')).toBeInTheDocument();
    expect(within(table).getByText('1.500.000')).toBeInTheDocument();
    expect(within(table).getByText('US$ 1,8123')).toBeInTheDocument();
    expect(within(table).getByText('2.300 ms')).toBeInTheDocument();
    expect(within(table).getByText('9.100 ms')).toBeInTheDocument();
    expect(within(table).getByText('2,5 %')).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Costo estimado' })).toBeInTheDocument();
    expect(screen.getByText(/ESTIMACIÓN/)).toBeInTheDocument();
  });

  it('por modelo: el id del modelo tal cual y "Sin datos" cuando no hay percentil', () => {
    render(
      <UsageTable
        title="Uso por modelo"
        keyHeader="Modelo"
        rows={[
          row({
            key: 'meta/llama-3.3-70b',
            latencyP50Ms: null,
            latencyP95Ms: null,
            fallbackRate: null,
          }),
        ]}
      />,
    );
    expect(screen.getByRole('rowheader', { name: 'meta/llama-3.3-70b' })).toBeInTheDocument();
    expect(screen.getAllByText('Sin datos')).toHaveLength(3);
  });

  it('sin filas: estado vacío explicado', () => {
    render(<UsageTable title="Uso por función" keyHeader="Función" rows={[]} humanizeKey />);
    expect(screen.getByText('Sin uso en este período')).toBeInTheDocument();
  });
});

describe('FailuresTable', () => {
  it('fallos por paso con el motivo traducido', () => {
    render(
      <FailuresTable
        failures={[
          { step: 'GENERATE', errorCode: 'TIMEOUT', count: 3 },
          { step: 'JUDGE', errorCode: null, count: 1 },
        ]}
      />,
    );
    expect(screen.getByRole('rowheader', { name: 'Generación' })).toBeInTheDocument();
    expect(screen.getByText('Tiempo agotado')).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Verificación (juez)' })).toBeInTheDocument();
    expect(screen.getByText('Sin código')).toBeInTheDocument();
  });

  it('fallos de conexión con el agente (TRANSPORT) con etiquetas legibles', () => {
    render(
      <FailuresTable
        failures={[
          { step: 'TRANSPORT', errorCode: 'AGENT_UNREACHABLE', count: 2 },
          { step: 'TRANSPORT', errorCode: 'AGENT_TIMEOUT', count: 1 },
        ]}
      />,
    );
    expect(screen.getAllByRole('rowheader', { name: 'Conexión con el agente' })).toHaveLength(2);
    expect(screen.getByText('Agente inalcanzable')).toBeInTheDocument();
    expect(screen.getByText('El agente no respondió a tiempo')).toBeInTheDocument();
  });

  it('sin fallos: mensaje positivo', () => {
    render(<FailuresTable failures={[]} />);
    expect(screen.getByText('Sin fallos en este período')).toBeInTheDocument();
  });
});

describe('ImpactTiles', () => {
  it('muestra adopción, tiempo, calidad y costo estimado, solo agregados', () => {
    render(<ImpactTiles impact={impact} />);
    expect(screen.getByText('80,0 %')).toBeInTheDocument();
    expect(screen.getByText('8 de 10 (aceptadas o validadas)')).toBeInTheDocument();
    expect(screen.getByText('2.100 ms')).toBeInTheDocument();
    expect(screen.getByText('12,3 puntos')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Costo (estimado)' })).toBeInTheDocument();
    expect(screen.getByText('US$ 0,0180')).toBeInTheDocument();
    expect(screen.getByText('Solo el conteo, sin nombres')).toBeInTheDocument();
    expect(screen.getByText('Costo estimado: Versión accesible')).toBeInTheDocument();
    // Sin datos todavía: no inventa un 0.
    expect(screen.getAllByText('Sin datos').length).toBeGreaterThanOrEqual(2);
  });
});

describe('RangeFilter', () => {
  it('marca el período actual con aria-current y enlaza a los demás', () => {
    render(<RangeFilter current={7} />);
    expect(screen.getByRole('link', { name: 'Últimos 7 días' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Últimos 30 días' })).toHaveAttribute(
      'href',
      '/admin/uso-ia?dias=30',
    );
    expect(screen.getByRole('link', { name: 'Últimos 90 días' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
