import type { Spec } from '@json-render/core';
import { formatDate, formatNumber, formatPercent, formatScore } from '@/lib/format';
import type { Band, ReportKeyResultDto, ReportObjectiveDto, TeamReportDto } from './report-types';

/**
 * TeamReportDto -> Spec de json-render. PURO: sin I/O ni render, se prueba con aserciones.
 * Todo el texto sale ya formateado (es-AR, voseo): el registro solo lo dibuja.
 *
 * Reglas:
 * - Personas en orden alfabético (colación es), NUNCA por score.
 * - Sin check-ins no hay banda: badge neutro "Sin check-ins" (KR sin `lastCheckInAt`; objetivo sin
 *   ningún KR con check-in).
 * - Estado = ícono + palabra, nunca solo color.
 */

export const ORIGIN_RANGE = { min: 0.4, max: 0.6 } as const;

/** Props de un badge. `band: null` = estado neutro. */
export type BadgeProps = { band: Band | null; label: string };

export const BAND_WORD: Record<Band, string> = {
  GREEN: 'En ruta',
  YELLOW: 'Requiere atención',
  RED: 'En riesgo',
};
export const NO_CHECK_INS = 'Sin check-ins';

export type KeyResultRowProps = {
  title: string;
  detail: string;
  badge: BadgeProps;
  footnote: string;
};

export type ObjectiveBlockProps = {
  title: string;
  meta: string;
  badge: BadgeProps;
  keyResults: KeyResultRowProps[];
};

const collator = new Intl.Collator('es', { sensitivity: 'base' });

function decimal(value: string | null): string {
  if (value === null) return '-';
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return formatNumber(n, Number.isInteger(n) ? 0 : 2);
}

function scoreBadge(band: Band, score: number): BadgeProps {
  return { band, label: `${BAND_WORD[band]} · ${formatScore(score)}` };
}

const neutralBadge = (): BadgeProps => ({ band: null, label: NO_CHECK_INS });

function keyResultRow(kr: ReportKeyResultDto): KeyResultRowProps {
  const unit = kr.unit ? ` ${kr.unit}` : '';
  const detail =
    kr.scoring === 'MANUAL'
      ? 'Resultado binario'
      : `Inicio ${decimal(kr.startValue)} · Meta ${decimal(kr.targetValue)}${unit} · Actual ${decimal(kr.currentValue)}${unit}`;
  const lastCheckInAt = kr.lastCheckInAt;
  return {
    title: kr.title,
    detail,
    badge: lastCheckInAt !== null ? scoreBadge(kr.band, kr.score) : neutralBadge(),
    footnote:
      lastCheckInAt !== null ? `Último check-in ${formatDate(lastCheckInAt)}` : NO_CHECK_INS,
  };
}

function objectiveProps(o: ReportObjectiveDto): ObjectiveBlockProps {
  const hasCheckIns = o.keyResults.some((kr) => kr.lastCheckInAt !== null);
  const parts = [
    o.type === 'COMMITTED' ? 'Comprometido' : 'Aspiracional',
    o.origin === 'TOP_DOWN' ? 'De arriba hacia abajo' : 'De abajo hacia arriba',
    o.status === 'CLOSED' ? 'Cerrado' : 'Publicado',
  ];
  if (o.finalScore !== null) {
    parts.push(`Final ${formatScore(o.finalScore)} (${o.achieved ? 'Logrado' : 'No logrado'})`);
  }
  return {
    title: o.title,
    meta: parts.join(' · '),
    badge: hasCheckIns ? scoreBadge(o.band, o.score) : neutralBadge(),
    keyResults: o.keyResults.map(keyResultRow),
  };
}

export function originMixText(mix: TeamReportDto['originMix']): {
  summary: string;
  warning: string | null;
} {
  const share =
    mix.bottomUpRatio === null
      ? 'Sin objetivos en el ciclo'
      : `${formatPercent(mix.bottomUpRatio)} de abajo hacia arriba`;
  const outside =
    mix.bottomUpRatio !== null &&
    (mix.bottomUpRatio < ORIGIN_RANGE.min || mix.bottomUpRatio > ORIGIN_RANGE.max);
  return {
    summary: `De arriba hacia abajo: ${mix.topDown} · De abajo hacia arriba: ${mix.bottomUp} · ${share}`,
    warning:
      mix.warning || outside
        ? 'La mezcla queda fuera del rango sugerido de 40 % a 60 % de objetivos de abajo hacia arriba. Es solo un indicador: conversalo con el equipo si querés equilibrarla.'
        : null,
  };
}

/** Personas ordenadas alfabéticamente (es). El score no interviene jamás. */
export function sortMembersAlphabetically<T extends { name: string; userId: string }>(
  members: T[],
): T[] {
  return [...members].sort(
    (a, b) => collator.compare(a.name, b.name) || a.userId.localeCompare(b.userId),
  );
}

export function buildTeamReportSpec(report: TeamReportDto): Spec {
  const elements: Spec['elements'] = {};
  const pageChildren: string[] = [];
  let seq = 0;
  const add = (type: string, props: Record<string, unknown>, children: string[] = []): string => {
    const id = `e${seq++}`;
    elements[id] = { type, props, children };
    return id;
  };
  const plain = (text: string) =>
    add('Text', {
      text,
      fontSize: 9,
      color: '#5e4e6b',
      align: null,
      fontWeight: null,
      fontStyle: null,
      lineHeight: null,
    });
  const objective = (o: ReportObjectiveDto) => add('ObjectiveBlock', { ...objectiveProps(o) });

  pageChildren.push(
    add('BrandHeader', {
      title: report.team.name,
      subtitle: `Ciclo ${report.cycle.name}`,
      meta: `Generado el ${formatDate(report.generatedAt)}`,
    }),
  );
  pageChildren.push(add('OriginMix', originMixText(report.originMix)));

  pageChildren.push(add('SectionTitle', { text: 'Objetivos del equipo', level: 'h2' }));
  if (report.teamObjectives.length === 0) {
    pageChildren.push(plain('El equipo no tiene objetivos publicados en este ciclo.'));
  }
  report.teamObjectives.forEach((o) => pageChildren.push(objective(o)));

  pageChildren.push(add('SectionTitle', { text: 'Personas', level: 'h2' }));
  if (report.members.length === 0) pageChildren.push(plain('El equipo no tiene integrantes.'));
  for (const member of sortMembersAlphabetically(report.members)) {
    pageChildren.push(add('SectionTitle', { text: member.name, level: 'h3' }));
    if (member.objectives.length === 0) {
      pageChildren.push(plain('Sin objetivos publicados en este ciclo.'));
    }
    member.objectives.forEach((o) => pageChildren.push(objective(o)));
  }

  const page = add(
    'Page',
    { footerLeft: `${report.team.name} · ${report.cycle.name}` },
    pageChildren,
  );
  const doc = add(
    'Document',
    {
      title: `Reporte de equipo - ${report.team.name} - ${report.cycle.name}`,
      author: 'Flock OKR',
      subject: null,
    },
    [page],
  );
  return { root: doc, elements };
}
