/**
 * Normalización de texto compartida por el anclaje (sourceQuote), la búsqueda BM25 y los slugs.
 * Misma normalización que aplica el agente en `local_checks.py` (NFC -> sin tildes -> minúsculas -> espacios colapsados).
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** ¿`quote` aparece literalmente (normalizado) en alguno de los textos? */
export function isQuoteGrounded(quote: string, texts: readonly string[]): boolean {
  const q = normalizeText(quote);
  if (q.length === 0) return false;
  return texts.some((t) => normalizeText(t).includes(q));
}
