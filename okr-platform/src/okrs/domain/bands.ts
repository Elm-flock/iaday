/** Espeja el enum Prisma ScoreBand sin importar el cliente en el dominio. */
export type ScoreBand = 'RED' | 'YELLOW' | 'GREEN';

/**
 * Banda sobre el score SIN redondear: RED [0,0.4), YELLOW [0.4,0.7), GREEN [0.7,1].
 * Ej.: 0.399999 sigue siendo RED.
 */
export function bandOf(score: number): ScoreBand {
  if (score < 0.4) return 'RED';
  if (score < 0.7) return 'YELLOW';
  return 'GREEN';
}
