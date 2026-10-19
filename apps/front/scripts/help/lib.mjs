/**
 * Pipeline de la ayuda (build/dev, NUNCA en el bundle del cliente): Markdown de `docs/manuales` -> AST propio
 * (sin HTML crudo) + secciones con texto plano. Lo usan `scripts/build-help.mjs` y los tests.
 *
 * Seguridad: el Markdown NO se convierte a HTML. Se arma un AST cerrado (solo los nodos de abajo) y el render
 * es React normal (escapa todo). El HTML crudo del Markdown se degrada a texto; los enlaces solo pueden ser
 * `#ancla`, `/ayuda/...`, http(s) y mailto; las imágenes solo las de `../manual/img/`.
 *
 * Slug de anclas: github-slugger 2.0.0 (ver docs/manuales/README.md). Una instancia NUEVA por manual, se le
 * pasan TODOS los títulos (H1..H6) en orden de aparición; los repetidos reciben `-1`, `-2`...
 */
import { createHash } from 'node:crypto';
import { marked } from 'marked';
import GithubSlugger from 'github-slugger';

export const SCHEMA_VERSION = 1;
export const SLUG_ALGORITHM = 'github-slugger@2.0.0';

/** @type {{ id: string, file: string, roles: string[] }[]} */
export const MANUALS = [
  { id: 'usuario', file: 'manual-usuario.md', roles: ['ADMIN', 'LEADER', 'MEMBER'] },
  { id: 'admin', file: 'manual-admin.md', roles: ['ADMIN'] },
];

const IMG_PREFIX = '../manual/img/';
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
/** @param {string} s */
const unescapeHtml = (s) => s.replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m]);

/** Normaliza saltos de línea: el hash no puede depender de CRLF/LF (Windows vs CI). */
export const normalizeEol = (/** @type {string} */ s) => s.replace(/\r\n?/g, '\n');

/** Slugs de una lista de títulos, con la semántica de github-slugger (duplicados -> `-1`, `-2`). */
export function slugify(/** @type {string[]} */ headings) {
  const slugger = new GithubSlugger();
  return headings.map((h) => slugger.slug(h));
}

/** Front-matter simple `clave: valor` entre `---`. */
export function parseFrontMatter(/** @type {string} */ src) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  /** @type {Record<string,string>} */
  const meta = {};
  if (!m) return { meta, body: src };
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: src.slice(m[0].length) };
}

function decodeSafe(/** @type {string} */ s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Destino de un enlace del Markdown -> href seguro, o null si no se permite. */
export function resolveHref(
  /** @type {string} */ href,
  /** @type {{ ownManual: string, anchors: Set<string> }} */ ctx,
) {
  if (href.startsWith('#')) {
    const frag = decodeSafe(href.slice(1));
    if (!ctx.anchors.has(frag)) throw new Error(`Ancla rota en ${ctx.ownManual}: ${href}`);
    return `#${frag}`;
  }
  const cross = /^manual-(usuario|admin)\.md(#.*)?$/.exec(href);
  if (cross) return `/ayuda/${cross[1]}${cross[2] ?? ''}`;
  if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) return href;
  return null;
}

/** @typedef {{ ownManual: string, anchors: Set<string>, images: Set<string> }} Ctx */

/** Convierte tokens inline de marked en nodos del AST. */
function inlines(/** @type {any[] | undefined} */ tokens, /** @type {Ctx} */ ctx) {
  /** @type {any[]} */
  const out = [];
  for (const t of tokens ?? []) {
    switch (t.type) {
      case 'text':
      case 'escape':
        if (t.tokens) out.push(...inlines(t.tokens, ctx));
        else out.push({ t: 'text', v: unescapeHtml(t.text) });
        break;
      case 'strong':
        out.push({ t: 'strong', c: inlines(t.tokens, ctx) });
        break;
      case 'em':
        out.push({ t: 'em', c: inlines(t.tokens, ctx) });
        break;
      case 'del':
        out.push(...inlines(t.tokens, ctx));
        break;
      case 'codespan':
        out.push({ t: 'code', v: unescapeHtml(t.text) });
        break;
      case 'br':
        out.push({ t: 'br' });
        break;
      case 'link': {
        const href = resolveHref(t.href, ctx);
        const children = inlines(t.tokens, ctx);
        out.push(href ? { t: 'link', href, c: children } : { t: 'text', v: plain(children) });
        break;
      }
      case 'image': {
        if (!t.href.startsWith(IMG_PREFIX)) throw new Error(`Imagen no permitida: ${t.href}`);
        const file = t.href.slice(IMG_PREFIX.length);
        if (!/^[\w.-]+\.png$/.test(file)) throw new Error(`Imagen no permitida: ${t.href}`);
        ctx.images.add(file);
        out.push({ t: 'img', file, alt: unescapeHtml(t.text) });
        break;
      }
      default:
        // `html` (inline) y cualquier otro: se degrada a texto (React lo escapa).
        out.push({ t: 'text', v: unescapeHtml(t.raw ?? t.text ?? '') });
    }
  }
  return out;
}

/** Texto plano de nodos inline. */
export function plain(/** @type {any[]} */ nodes) {
  return nodes
    .map((n) => {
      switch (n.t) {
        case 'text':
        case 'code':
          return n.v;
        case 'br':
          return ' ';
        case 'img':
          return '';
        default:
          return plain(n.c);
      }
    })
    .join('');
}

/** Convierte tokens de bloque en nodos del AST. */
function blocks(/** @type {any[]} */ tokens, /** @type {Ctx} */ ctx) {
  /** @type {any[]} */
  const out = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'space':
        break;
      case 'heading':
        out.push({ t: 'h', level: t.depth, c: inlines(t.tokens, ctx), id: '' });
        break;
      case 'paragraph':
      case 'text':
        out.push({
          t: 'p',
          c: t.tokens ? inlines(t.tokens, ctx) : [{ t: 'text', v: unescapeHtml(t.text) }],
        });
        break;
      case 'list':
        out.push({
          t: t.ordered ? 'ol' : 'ul',
          items: t.items.map((/** @type {any} */ it) => blocks(it.tokens, ctx)),
        });
        break;
      case 'blockquote':
        out.push({ t: 'quote', c: blocks(t.tokens, ctx) });
        break;
      case 'code':
        out.push({ t: 'code', v: t.text });
        break;
      case 'hr':
        out.push({ t: 'hr' });
        break;
      case 'table':
        out.push({
          t: 'table',
          head: t.header.map((/** @type {any} */ h) => inlines(h.tokens, ctx)),
          rows: t.rows.map((/** @type {any[]} */ r) => r.map((cell) => inlines(cell.tokens, ctx))),
        });
        break;
      default:
        // HTML de bloque u otros: texto plano.
        out.push({ t: 'p', c: [{ t: 'text', v: unescapeHtml(t.raw ?? t.text ?? '').trim() }] });
    }
  }
  return out;
}

/** Texto plano de un bloque (índice de búsqueda y asistente). */
function blockText(/** @type {any} */ b) {
  switch (b.t) {
    case 'p':
      return plain(b.c);
    case 'ul':
    case 'ol':
      return b.items.map((/** @type {any[]} */ it) => it.map(blockText).join(' ')).join('\n');
    case 'quote':
      return b.c.map(blockText).join('\n');
    case 'code':
      return b.v;
    case 'table':
      return [b.head, ...b.rows].map((r) => r.map(plain).join(' | ')).join('\n');
    default:
      return '';
  }
}

/**
 * Parsea UN manual. `images` (Set) acumula los archivos de imagen referenciados.
 */
export function parseManual(
  /** @type {string} */ source,
  /** @type {{ id: string, images?: Set<string> }} */ { id, images = new Set() },
) {
  const { meta, body } = parseFrontMatter(normalizeEol(source));
  const tokens = marked.lexer(body);

  // Primera pasada: títulos, para conocer las anclas antes de resolver los `#enlaces`.
  const probe = { ownManual: id, anchors: new Set(), images: new Set() };
  const headingTexts = tokens
    .filter((t) => t.type === 'heading')
    .map((t) => plain(inlines(/** @type {any} */ (t).tokens, probe)));
  const slugs = slugify(headingTexts);
  const ctx = { ownManual: id, anchors: new Set(slugs), images };

  const ast = blocks(tokens, ctx);
  let n = 0;
  for (const b of ast) if (b.t === 'h') b.id = slugs[n++];

  /** @type {{ id: string, manual: string, anchor: string, title: string, level: number, parent: string | null, text: string[] }[]} */
  const draft = [];
  /** @type {(typeof draft)[number] | null} */
  let current = null;
  for (const b of ast) {
    if (b.t === 'h') {
      current = {
        id: `${id}#${b.id}`,
        manual: id,
        anchor: b.id,
        title: plain(b.c),
        level: b.level,
        parent: null,
        text: [],
      };
      draft.push(current);
    } else if (current) {
      const txt = blockText(b);
      if (txt) current.text.push(txt);
    }
  }
  let lastH2 = null;
  for (const s of draft) {
    if (s.level === 2) lastH2 = s.anchor;
    else if (s.level === 3) s.parent = lastH2;
  }
  const sections = draft.map(({ text, ...s }) => ({ ...s, plainText: text.join('\n') }));
  return { meta, blocks: ast, sections };
}

/** Hash de las fuentes (manuales normalizados): detecta que lo generado quedó viejo. */
export function hashSources(/** @type {Record<string,string>} */ sources) {
  const h = createHash('sha256');
  h.update(`v${SCHEMA_VERSION}\n`);
  for (const m of MANUALS) h.update(`${m.id}\n${normalizeEol(sources[m.id])}\n`);
  return h.digest('hex');
}

/** Dimensiones de un PNG (cabecera IHDR) sin dependencias. */
export function pngSize(/** @type {Buffer} */ buf) {
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') throw new Error('No es un PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * Construye lo generado a partir de las fuentes en memoria.
 * `readImage(file)` lee `docs/manual/img/<file>` (falla si no existe: imagen rota = build roto).
 */
export function buildHelp(
  /** @type {Record<string,string>} */ sources,
  /** @type {(file: string) => Buffer} */ readImage,
) {
  const sourceHash = hashSources(sources);
  const images = new Set(/** @type {string[]} */ ([]));
  const parsed = MANUALS.map((m) => ({ m, p: parseManual(sources[m.id], { id: m.id, images }) }));
  /** @type {Record<string, { width: number, height: number }>} */
  const sizes = {};
  for (const file of [...images].sort()) sizes[file] = pngSize(readImage(file));

  const manuals = parsed.map(({ m, p }) => ({
    id: m.id,
    title: p.meta.title ?? m.id,
    audience: p.meta.audience ?? '',
    version: p.meta.version ?? '',
    updated: p.meta.updated ?? '',
    roles: m.roles,
    sections: p.sections,
    blocks: p.blocks,
  }));
  const help = { schemaVersion: SCHEMA_VERSION, sourceHash, manuals, images: sizes };
  const index = {
    schemaVersion: SCHEMA_VERSION,
    slugAlgorithm: SLUG_ALGORITHM,
    sourceHash,
    manuals: manuals.map(({ id, title, audience, version, updated, roles }) => ({
      id,
      title,
      audience,
      version,
      updated,
      roles,
    })),
    sections: manuals.flatMap((m) =>
      m.sections.map((s) => ({
        id: s.id,
        manual: s.manual,
        anchor: s.anchor,
        title: s.title,
        level: s.level,
        parent: s.parent,
        url: `/ayuda/${s.manual}#${s.anchor}`,
        plainText: s.plainText,
      })),
    ),
  };
  return { help, index, images: Object.keys(sizes) };
}
