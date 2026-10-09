export type ScoreBand = 'on-track' | 'attention' | 'at-risk';

/** Bandas de score OKR: verde 0.7–1.0, amarillo 0.4–0.69, rojo 0.0–0.39. */
export function scoreBand(score: number): ScoreBand {
  if (score >= 0.7) return 'on-track';
  if (score >= 0.4) return 'attention';
  return 'at-risk';
}
