import { describe, expect, it } from 'vitest';
import { kr, objective, report } from './fixtures';
import { buildTeamReportSpec, originMixText } from './team-report-spec';
import type { ObjectiveBlockProps } from './team-report-spec';

type El = { type: string; props: Record<string, unknown>; children: string[] };

function parts(spec: ReturnType<typeof buildTeamReportSpec>) {
  const els = spec.elements as Record<string, El>;
  const page = els[els[spec.root].children[0]];
  return { els, nodes: page.children.map((id) => els[id]) };
}
const blocks = (nodes: El[]) =>
  nodes
    .filter((n) => n.type === 'ObjectiveBlock')
    .map((n) => n.props as unknown as ObjectiveBlockProps);
const teamBlock = (o: ReturnType<typeof objective>) =>
  blocks(parts(buildTeamReportSpec(report({ teamObjectives: [o] }))).nodes)[0];

describe('buildTeamReportSpec', () => {
  it('arma Document > Page con cabecera, mezcla, objetivos del equipo y personas', () => {
    const spec = buildTeamReportSpec(report());
    const { els, nodes } = parts(spec);
    expect(els[spec.root].type).toBe('Document');
    expect(els[spec.root].props.title).toBe('Reporte de equipo - Plataforma Núcleo - Q1 2026');
    expect(nodes.map((n) => n.type).slice(0, 4)).toEqual([
      'BrandHeader',
      'OriginMix',
      'SectionTitle',
      'ObjectiveBlock',
    ]);
    expect(nodes[0].props).toMatchObject({
      title: 'Plataforma Núcleo',
      subtitle: 'Ciclo Q1 2026',
      meta: 'Generado el 15/03/2026',
    });
  });

  it('ordena a las personas alfabéticamente (es) aunque la de mejor score tenga la última letra', () => {
    const { nodes } = parts(buildTeamReportSpec(report()));
    const people = nodes
      .filter((n) => n.type === 'SectionTitle' && n.props.level === 'h3')
      .map((n) => n.props.text);
    // Zoe tiene score 1 (el más alto) y va última; Óscar se ordena como "O", no al final por el acento.
    expect(people).toEqual(['Ana Pérez', 'Óscar Díaz', 'Zoe Álvarez']);
  });

  it('no altera el orden si cambian los scores', () => {
    const base = report();
    const swapped = report({
      members: base.members.map((m) => ({
        ...m,
        objectives: m.objectives.map((o) => ({ ...o, score: m.name.startsWith('Ana') ? 1 : 0.1 })),
      })),
    });
    const names = (r: ReturnType<typeof report>) =>
      parts(buildTeamReportSpec(r))
        .nodes.filter((n) => n.props.level === 'h3')
        .map((n) => n.props.text);
    expect(names(swapped)).toEqual(names(base));
  });

  it('un KR sin check-ins muestra el badge neutro "Sin check-ins", no una banda', () => {
    const block = teamBlock(
      objective({
        keyResults: [
          kr({ id: 'a', lastCheckInAt: null, score: 0.8, band: 'GREEN' }),
          kr({ id: 'b' }),
        ],
      }),
    );
    expect(block.keyResults[0].badge).toEqual({ band: null, label: 'Sin check-ins' });
    expect(block.keyResults[0].footnote).toBe('Sin check-ins');
    expect(block.keyResults[1].badge).toEqual({ band: 'GREEN', label: 'En ruta · 0,80' });
    expect(block.keyResults[1].footnote).toBe('Último check-in 10/03/2026');
  });

  it('un objetivo sin ningún check-in es neutro (aunque el back informe una banda)', () => {
    const block = teamBlock(
      objective({
        score: 0,
        band: 'RED',
        keyResults: [kr({ lastCheckInAt: null }), kr({ id: 'k2', lastCheckInAt: null })],
      }),
    );
    expect(block.badge).toEqual({ band: null, label: 'Sin check-ins' });
    expect(JSON.stringify(block)).not.toContain('En riesgo');
  });

  it('usa palabra + puntaje con formato es-AR para cada banda', () => {
    const block = teamBlock(
      objective({
        score: 0.5,
        band: 'YELLOW',
        keyResults: [kr({ score: 0.25, band: 'RED' }), kr({ id: 'y', score: 0.5, band: 'YELLOW' })],
      }),
    );
    expect(block.badge.label).toBe('Requiere atención · 0,50');
    expect(block.keyResults.map((k) => k.badge.label)).toEqual([
      'En riesgo · 0,25',
      'Requiere atención · 0,50',
    ]);
  });

  it('formatea números (1.234,5), unidades y KRs binarios', () => {
    const block = teamBlock(
      objective({
        keyResults: [
          kr({ startValue: '0', targetValue: '12345.5', currentValue: '1000', unit: 'USD' }),
          kr({
            id: 'm',
            scoring: 'MANUAL',
            unit: null,
            startValue: null,
            targetValue: null,
            currentValue: null,
          }),
        ],
      }),
    );
    expect(block.keyResults[0].detail).toBe('Inicio 0 · Meta 12.345,50 USD · Actual 1.000 USD');
    expect(block.keyResults[1].detail).toBe('Resultado binario');
  });

  it('un objetivo cerrado informa puntaje final y logro', () => {
    const block = teamBlock(objective({ status: 'CLOSED', finalScore: 0.65, achieved: false }));
    expect(block.meta).toBe(
      'Comprometido · De abajo hacia arriba · Cerrado · Final 0,65 (No logrado)',
    );
  });

  it('indica vacíos con copy claro, sin romper', () => {
    const text = JSON.stringify(buildTeamReportSpec(report({ teamObjectives: [], members: [] })));
    expect(text).toContain('El equipo no tiene objetivos publicados en este ciclo.');
    expect(text).toContain('El equipo no tiene integrantes.');
  });

  it('no incluye palabras de ranking ni de compensación', () => {
    const text = JSON.stringify(buildTeamReportSpec(report())).toLowerCase();
    for (const word of [
      'ranking',
      'top ',
      'mejor',
      'peor',
      'posición',
      'bono',
      'compensación',
      'feedback',
    ]) {
      expect(text).not.toContain(word);
    }
  });
});

describe('originMixText', () => {
  const mix = (bottomUpRatio: number | null, warning = false) => ({
    topDown: 2,
    bottomUp: 3,
    bottomUpRatio,
    warning,
  });

  it('dentro de 40–60 % no hay aviso', () => {
    const t = originMixText(mix(0.5));
    expect(t.summary).toBe(
      'De arriba hacia abajo: 2 · De abajo hacia arriba: 3 · 50 % de abajo hacia arriba',
    );
    expect(t.warning).toBeNull();
    expect(originMixText(mix(0.4)).warning).toBeNull();
    expect(originMixText(mix(0.6)).warning).toBeNull();
  });

  it('fuera de 40–60 % es un aviso suave (solo indicador)', () => {
    const t = originMixText(mix(0.75, true));
    expect(t.warning).toContain('fuera del rango sugerido de 40 % a 60 %');
    expect(t.warning).toContain('solo un indicador');
    expect(originMixText(mix(0.39)).warning).not.toBeNull();
  });

  it('sin objetivos no hay porcentaje ni aviso', () => {
    const t = originMixText(mix(null));
    expect(t.summary).toContain('Sin objetivos en el ciclo');
    expect(t.warning).toBeNull();
  });
});
