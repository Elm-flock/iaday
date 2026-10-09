/** Enlace opcional a un objetivo o KR desde un formulario (feedback / reconocimientos). Valor de un <select>. */

export type OkrLink = { objectiveId: string; keyResultId?: string };

export const encodeObjectiveLink = (objectiveId: string) => `obj:${objectiveId}`;
export const encodeKeyResultLink = (objectiveId: string, keyResultId: string) =>
  `kr:${objectiveId}:${keyResultId}`;

/** `''` / inválido → `null` (sin enlace). */
export function decodeLink(raw: string): OkrLink | null {
  const parts = raw.trim().split(':');
  if (parts[0] === 'obj' && parts.length === 2 && parts[1]) return { objectiveId: parts[1] };
  if (parts[0] === 'kr' && parts.length === 3 && parts[1] && parts[2]) {
    return { objectiveId: parts[1], keyResultId: parts[2] };
  }
  return null;
}

type LinkableObjective = {
  id: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  keyResults: { id: string; title: string }[];
};

/** Opciones de enlace (objetivo y sus KRs) entre los objetivos visibles; los borradores no se enlazan. */
export function buildLinkOptions(
  objectives: LinkableObjective[],
): { value: string; label: string }[] {
  return objectives
    .filter((o) => o.status !== 'DRAFT')
    .flatMap((o) => [
      { value: encodeObjectiveLink(o.id), label: `Objetivo: ${o.title}` },
      ...o.keyResults.map((kr) => ({
        value: encodeKeyResultLink(o.id, kr.id),
        label: `Resultado clave: ${kr.title} (${o.title})`,
      })),
    ]);
}
