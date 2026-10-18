import type { HelpSection } from './help-data';

/** Minúsculas y sin tildes: "Cómo" y "como" se buscan igual. */
export const normalize = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export type SearchHit = { section: HelpSection; snippet: string; inTitle: boolean };

export const MAX_RESULTS = 20;
const SNIPPET = 140;

function snippetFor(text: string, terms: string[]): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const folded = normalize(flat);
  const at = terms.map((t) => folded.indexOf(t)).filter((i) => i >= 0);
  const start = Math.max(0, (at.length ? Math.min(...at) : 0) - 40);
  const cut = flat.slice(start, start + SNIPPET);
  return `${start > 0 ? '…' : ''}${cut}${start + SNIPPET < flat.length ? '…' : ''}`;
}

/**
 * Búsqueda simple del lado del servidor: todas las palabras deben estar en el título o en el texto de la
 * sección. Primero las que coinciden en el título. Sin dependencias ni JS en el cliente.
 */
export function searchSections(sections: HelpSection[], query: string): SearchHit[] {
  const terms = normalize(query)
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (terms.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const section of sections) {
    const title = normalize(section.title);
    const body = normalize(section.plainText);
    if (!terms.every((t) => title.includes(t) || body.includes(t))) continue;
    hits.push({
      section,
      inTitle: terms.every((t) => title.includes(t)),
      snippet: snippetFor(section.plainText || section.title, terms),
    });
  }
  hits.sort((a, b) => Number(b.inTitle) - Number(a.inTitle));
  return hits.slice(0, MAX_RESULTS);
}
