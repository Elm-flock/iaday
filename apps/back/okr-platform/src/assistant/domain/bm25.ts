import { normalizeText } from './text';

export interface HelpChunk {
  /** `admin#<slug>` o `usuario#<slug>` (ancla estable del H3, o del H2 si no tiene H3). */
  id: string;
  manual: 'ADMIN' | 'USUARIO';
  /** Ruta de encabezados: "Usuarios > Cómo creo un usuario". */
  title: string;
  text: string;
  url: string;
}

export const TOP_K = 6;
export const MAX_TOTAL_CHARS = 12_000;
export const MAX_CHUNK_CHARS = 3_000;
const K1 = 1.2;
const B = 0.75;
const TITLE_BOOST = 2;

const STOPWORDS = new Set(
  'a al algo ante con contra cual cuando como de del desde donde el ella ellos en entre era es esa ese eso esta estan este esto fue ha hay la las le les lo los me mi mis muy ni no nos o para pero por que se si sin sobre su sus te tu tus un una uno unos unas y ya yo quiero necesito puedo quisiera hacer hago'.split(
    ' ',
  ),
);

/** Stemming liviano de sufijos frecuentes en español (suficiente para un manual chico). */
export function stem(token: string): string {
  let t = token;
  for (const suffix of ['ciones', 'cion', 'mente', 'es', 's']) {
    if (t.length > suffix.length + 3 && t.endsWith(suffix)) {
      t = t.slice(0, -suffix.length);
      break;
    }
  }
  return t;
}

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

/** Manuales a los que accede cada rol: ADMIN ve ambos; el resto, solo el de uso. */
export function manualsFor(audience: 'ADMIN' | 'LEADER' | 'MEMBER'): ('ADMIN' | 'USUARIO')[] {
  return audience === 'ADMIN' ? ['ADMIN', 'USUARIO'] : ['USUARIO'];
}

/**
 * BM25 (k1=1.2, b=0.75) sobre título + texto; los tokens del título pesan el doble.
 * Devuelve como máximo `TOP_K` fragmentos con score > 0 y no más de `MAX_TOTAL_CHARS` en total.
 */
export function searchChunks(
  chunks: readonly HelpChunk[],
  question: string,
  audience: 'ADMIN' | 'LEADER' | 'MEMBER',
  topK = TOP_K,
): HelpChunk[] {
  const allowed = new Set(manualsFor(audience));
  const pool = chunks.filter((c) => allowed.has(c.manual));
  const queryTokens = [...new Set(tokenize(question))];
  if (pool.length === 0 || queryTokens.length === 0) return [];

  const docs = pool.map((chunk) => {
    const tf = new Map<string, number>();
    const add = (tokens: string[], weight: number) => {
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + weight);
    };
    add(tokenize(chunk.title), TITLE_BOOST);
    add(tokenize(chunk.text), 1);
    const length = [...tf.values()].reduce((a, b) => a + b, 0);
    return { chunk, tf, length };
  });
  const avgLen = docs.reduce((a, d) => a + d.length, 0) / docs.length || 1;
  const df = new Map<string, number>();
  for (const q of queryTokens) df.set(q, docs.filter((d) => d.tf.has(q)).length);

  const scored = docs
    .map((d) => {
      let score = 0;
      for (const q of queryTokens) {
        const f = d.tf.get(q) ?? 0;
        if (f === 0) continue;
        const n = df.get(q) ?? 0;
        const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
        score += (idf * (f * (K1 + 1))) / (f + K1 * (1 - B + (B * d.length) / avgLen));
      }
      return { chunk: d.chunk, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id));

  const result: HelpChunk[] = [];
  let total = 0;
  for (const { chunk } of scored) {
    if (result.length >= topK) break;
    const text = chunk.text.slice(0, MAX_CHUNK_CHARS);
    if (total + text.length > MAX_TOTAL_CHARS) break;
    total += text.length;
    result.push({ ...chunk, text });
  }
  return result;
}
