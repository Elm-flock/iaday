/**
 * Minimización de datos (RGPD art. 5.1.c): lo único que sale hacia el agente son textos de
 * OKRs/check-ins/feedback ya armados. NUNCA nombres, emails ni IDs de personas, equipos o
 * entidades. Funciones puras: reciben datos planos y devuelven el payload del contrato.
 */
import type { CheckinSummaryRequest, OkrSuggestRequest, Segment } from '../agent-contract.types';

export const MAX_SEGMENT_CHARS = 4000;
export const MAX_SEGMENTS = 30;
export const MAX_SUMMARY_CHECK_INS = 52;

export interface MinimizableKr {
  position: number;
  title: string;
  unit: string | null;
  startValue: string | null;
  targetValue: string | null;
}

export interface MinimizableObjective {
  title: string;
  description: string | null;
  keyResults: MinimizableKr[];
}

const clip = (text: string): string => text.trim().slice(0, MAX_SEGMENT_CHARS);

/** "40.5000" -> "40,5"; "75.0000" -> "75". Formato es-AR para los textos que lee el agente. */
export function formatDecimalEs(raw: string): string {
  const trimmed = raw.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;
  const [int, dec = ''] = trimmed.split('.');
  const cleanDec = dec.replace(/0+$/, '');
  return cleanDec ? `${int},${cleanDec}` : int;
}

/** "de 40 a 75 %" / "de 8 a 4 h"; null si el KR no tiene valores. */
export function krTargetText(
  kr: Pick<MinimizableKr, 'unit' | 'startValue' | 'targetValue'>,
): string | null {
  if (kr.startValue === null || kr.targetValue === null) return null;
  const unit = kr.unit?.trim();
  return `de ${formatDecimalEs(kr.startValue)} a ${formatDecimalEs(kr.targetValue)}${unit ? ` ${unit}` : ''}`;
}

/** Valores de las metas de los KRs que deben sobrevivir literalmente a la adaptación. */
export function mustPreserveFromKrs(
  krs: Pick<MinimizableKr, 'startValue' | 'targetValue'>[],
): string[] {
  const out = new Set<string>();
  for (const kr of krs) {
    for (const v of [kr.startValue, kr.targetValue]) {
      if (v !== null) out.add(formatDecimalEs(v));
    }
  }
  return [...out].slice(0, 50);
}

export function objectiveSegments(obj: MinimizableObjective): Segment[] {
  const segments: Segment[] = [{ key: 'objective.title', text: clip(obj.title) }];
  if (obj.description && obj.description.trim()) {
    segments.push({ key: 'objective.description', text: clip(obj.description) });
  }
  for (const kr of [...obj.keyResults].sort((a, b) => a.position - b.position)) {
    segments.push({ key: `kr.${kr.position}.title`, text: clip(kr.title) });
    const target = krTargetText(kr);
    if (target) segments.push({ key: `kr.${kr.position}.target`, text: target });
  }
  return segments.slice(0, MAX_SEGMENTS);
}

/** Etiquetas es-AR de la accion del check-in (las mismas que muestra la UI). Nunca enviar el enum crudo. */
export const CHECK_IN_ACTION_LABELS: Record<string, string> = {
  CONTINUE: 'Continuar',
  UPDATE: 'Actualizar',
  START: 'Iniciar',
  STOP: 'Detener',
};

export function checkInActionLabel(action: string): string {
  return CHECK_IN_ACTION_LABELS[action] ?? action;
}

/** Check-in sin nota: no hay nada que adaptar (devuelve []). */
export function checkInSegments(
  checkIn: { note: string | null; action: string },
  krTitle: string,
): Segment[] {
  if (!checkIn.note || !checkIn.note.trim()) return [];
  return [
    { key: 'checkin.kr_title', text: clip(krTitle) },
    { key: 'checkin.action', text: checkInActionLabel(checkIn.action) },
    { key: 'checkin.note', text: clip(checkIn.note) },
  ];
}

export function feedbackSegments(feedback: { content: string }): Segment[] {
  if (!feedback.content.trim()) return [];
  return [{ key: 'feedback.content', text: clip(feedback.content) }];
}

/** Borrador de objetivo + KRs para /v1/okr-suggest (sin owner, sin ids). */
export function okrSuggestInput(input: {
  cycleKind: 'ANNUAL' | 'QUARTER';
  objective: { title: string; description?: string | null; type: 'COMMITTED' | 'ASPIRATIONAL' };
  keyResults: {
    title: string;
    unit?: string | null;
    startValue?: string | null;
    targetValue?: string | null;
  }[];
}): OkrSuggestRequest {
  return {
    cycleKind: input.cycleKind,
    objective: {
      title: input.objective.title.trim(),
      description: input.objective.description?.trim() || null,
      type: input.objective.type,
    },
    keyResults: input.keyResults.slice(0, 5).map((kr) => ({
      title: kr.title.trim(),
      unit: kr.unit?.trim() || null,
      startValue: kr.startValue ?? null,
      targetValue: kr.targetValue ?? null,
    })),
  };
}

export interface SummaryKr {
  title: string;
  scoring: 'DERIVED' | 'MANUAL';
  unit: string | null;
  startValue: string | null;
  targetValue: string | null;
  currentValue: string | null;
}

export interface SummaryCheckIn {
  createdAt: Date;
  value: string | null;
  score: number;
  band: 'RED' | 'YELLOW' | 'GREEN';
  action: 'CONTINUE' | 'UPDATE' | 'START' | 'STOP';
  note: string | null;
}

/** Últimos 52 check-ins en orden cronológico ascendente y SIN autor. */
export function krSummaryInput(
  kr: SummaryKr,
  checkIns: SummaryCheckIn[],
  level: CheckinSummaryRequest['level'],
): CheckinSummaryRequest {
  const ascending = [...checkIns]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(-MAX_SUMMARY_CHECK_INS);
  return {
    level,
    keyResult: {
      title: kr.title,
      scoring: kr.scoring,
      unit: kr.unit,
      startValue: kr.startValue,
      targetValue: kr.targetValue,
      currentValue: kr.currentValue,
    },
    checkIns: ascending.map((c) => ({
      date: c.createdAt.toISOString().slice(0, 10),
      value: c.value,
      score: c.score,
      band: c.band,
      action: c.action,
      note: c.note,
    })),
  };
}
