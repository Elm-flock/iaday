import { MAX_CHUNK_CHARS, type HelpChunk } from './bm25';

/** Forma del índice canónico que emite el front (docs/manuales/help-index.json). */
export interface HelpIndexFile {
  schemaVersion: number;
  slugAlgorithm: string;
  sourceHash: string;
  manuals: { id: string; title: string; roles: string[] }[];
  sections: {
    id: string;
    manual: string;
    anchor: string;
    title: string;
    level: number;
    parent: string | null;
    url: string;
    plainText: string;
  }[];
}

export const SUPPORTED_SCHEMA_VERSION = 1;

/**
 * Fragmentos buscables: una sección H2/H3 con texto = un fragmento (las H2 solo traen su introducción;
 * los pasos viven en cada H3). Título = "H2 > H3". El H1 (portada del manual) no se indexa.
 */
export function sectionsToChunks(index: HelpIndexFile): HelpChunk[] {
  const titleOf = new Map(index.sections.map((s) => [`${s.manual}#${s.anchor}`, s.title]));
  const chunks: HelpChunk[] = [];
  for (const s of index.sections) {
    if (s.level < 2 || s.plainText.trim().length === 0) continue;
    const parentTitle = s.parent ? titleOf.get(`${s.manual}#${s.parent}`) : undefined;
    chunks.push({
      id: s.id,
      manual: s.manual === 'admin' ? 'ADMIN' : 'USUARIO',
      title: parentTitle ? `${parentTitle} > ${s.title}` : s.title,
      text: s.plainText.slice(0, MAX_CHUNK_CHARS),
      url: s.url,
    });
  }
  return chunks;
}

/** Id ASCII `^(admin|usuario)#[a-z0-9-]+$` que exige el contrato del agente (los anclas del front conservan tildes). */
export function wireId(canonicalId: string): string {
  const [manual, ...rest] = canonicalId.split('#');
  const slug = rest
    .join('#')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${manual}#${slug || 'seccion'}`;
}

/**
 * Prepara los fragmentos para el agente: ids ASCII únicos y el mapa para volver a los ids canónicos
 * (las citas que vuelven se traducen de nuevo, así el front enlaza con el ancla real).
 */
export function toWireChunks(chunks: HelpChunk[]): {
  wire: HelpChunk[];
  toCanonical: Map<string, HelpChunk>;
} {
  const toCanonical = new Map<string, HelpChunk>();
  const wire = chunks.map((chunk) => {
    let id = wireId(chunk.id);
    for (let n = 2; toCanonical.has(id); n++) id = `${wireId(chunk.id)}-${n}`;
    toCanonical.set(id, chunk);
    return { ...chunk, id };
  });
  return { wire, toCanonical };
}
