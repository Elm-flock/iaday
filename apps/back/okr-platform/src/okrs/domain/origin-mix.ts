export type ObjectiveOrigin = 'TOP_DOWN' | 'BOTTOM_UP';

export interface OriginMix {
  topDown: number;
  bottomUp: number;
  bottomUpRatio: number | null;
  warning: boolean;
}

/** Indicador 50/50 (blando): warning si % bottom-up queda fuera de [40%,60%]. Nunca bloquea. */
export function originMix(objs: { origin: ObjectiveOrigin }[]): OriginMix {
  const total = objs.length;
  const bottomUp = objs.filter((o) => o.origin === 'BOTTOM_UP').length;
  if (total === 0) return { topDown: 0, bottomUp: 0, bottomUpRatio: null, warning: false };
  // Comparación entera para evitar errores de coma flotante en los bordes.
  const warning = bottomUp * 5 < total * 2 || bottomUp * 5 > total * 3;
  return {
    topDown: total - bottomUp,
    bottomUp,
    bottomUpRatio: bottomUp / total,
    warning,
  };
}
