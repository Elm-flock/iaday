// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MANUALS,
  buildHelp,
  normalizeEol,
  parseManual,
  resolveHref,
  slugify,
} from '../../../../scripts/help/lib.mjs';
import { HELP_EASY_READ_HREF } from '../_ai/messages';
import { HELP } from './help-data';

const root = join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

describe('slug (github-slugger 2.0.0)', () => {
  it('minúsculas, espacios a guiones, sin puntuación y conserva tildes y ñ', () => {
    expect(
      slugify(['Cómo creo un ciclo', '¿Qué es la mezcla 50/50?', 'Año nuevo: ¡Hola!']),
    ).toEqual(['cómo-creo-un-ciclo', 'qué-es-la-mezcla-5050', 'año-nuevo-hola']);
  });

  it('conserva guiones existentes y repetidos reciben -1, -2', () => {
    expect(slugify(['Check-ins', 'Uso', 'Uso', 'Uso'])).toEqual([
      'check-ins',
      'uso',
      'uso-1',
      'uso-2',
    ]);
  });

  it('cada manual numera sus repetidos por separado', () => {
    const a = parseManual('# T\n\n## Uso\n\n## Uso\n', { id: 'usuario' });
    const b = parseManual('# T\n\n## Uso\n', { id: 'admin' });
    expect(a.sections.map((s) => s.anchor)).toEqual(['t', 'uso', 'uso-1']);
    expect(b.sections.map((s) => s.anchor)).toEqual(['t', 'uso']);
  });
});

describe('parser y sanitizado', () => {
  const parse = (md: string) => parseManual(md, { id: 'usuario' });

  it('el HTML crudo se degrada a texto: nunca hay nodos de HTML', () => {
    const { blocks } = parse(
      '# T\n\nHola <script>alert(1)</script> y <b>x</b>\n\n<div onclick="x()">hola</div>\n',
    );
    const json = JSON.stringify(blocks);
    expect(json).toContain('"t":"text","v":"<script>"'); // como TEXTO (React lo escapa)
    expect(json).toContain('<div onclick=');
    expect(blocks.every((b) => ['h', 'p'].includes(b.t))).toBe(true);
  });

  it('descarta enlaces con esquemas peligrosos y deja solo el texto', () => {
    const { blocks } = parse(
      '# T\n\n[clic](javascript:alert(1)) [datos](data:text/html,x) [ok](https://flockit.com.ar)\n',
    );
    const json = JSON.stringify(blocks[1]);
    expect(json).not.toContain('javascript:');
    expect(json).not.toContain('data:text');
    expect(json).toContain('https://flockit.com.ar');
  });

  it('resolveHref: ancla propia, cruce entre manuales y rechazos', () => {
    const ctx = { ownManual: 'usuario', anchors: new Set(['cómo-hago']) };
    expect(resolveHref('#c%C3%B3mo-hago', ctx)).toBe('#cómo-hago');
    expect(resolveHref('manual-admin.md', ctx)).toBe('/ayuda/admin');
    expect(resolveHref('manual-usuario.md#x', ctx)).toBe('/ayuda/usuario#x');
    expect(resolveHref('mailto:a@b.com', ctx)).toBe('mailto:a@b.com');
    expect(resolveHref('ftp://x', ctx)).toBeNull();
    expect(() => resolveHref('#no-existe', ctx)).toThrow(/Ancla rota/);
  });

  it('una imagen fuera de ../manual/img/ rompe el build', () => {
    expect(() => parse('# T\n\n![x](https://evil.test/a.png)\n')).toThrow(/Imagen no permitida/);
    expect(() => parse('# T\n\n![x](../manual/img/../../secreto.png)\n')).toThrow(
      /Imagen no permitida/,
    );
  });

  it('secciones: id con manual, nivel, padre y texto plano (tablas y listas incluidas)', () => {
    const { sections } = parse(
      '# Manual\n\n## Área\n\nIntro.\n\n### Tarea **uno**\n\n1. Paso `a`\n2. Paso b\n\n| X | Y |\n|---|---|\n| 1 | 2 |\n',
    );
    const tarea = sections.find((s) => s.anchor === 'tarea-uno');
    expect(tarea).toMatchObject({
      id: 'usuario#tarea-uno',
      level: 3,
      parent: 'área',
      title: 'Tarea uno',
    });
    expect(tarea?.plainText).toContain('Paso a');
    expect(tarea?.plainText).toContain('1 | 2');
  });
});

describe('ayuda generada a partir de docs/manuales', () => {
  const sources = Object.fromEntries(MANUALS.map((m) => [m.id, read('docs', 'manuales', m.file)]));
  const built = buildHelp(sources, (f) => readFileSync(join(root, 'docs', 'manual', 'img', f)));

  it('NO está vieja: lo generado coincide con el Markdown (corré npm run help:build)', () => {
    expect(
      normalizeEol(read('src', 'app', '(app)', 'ayuda', '_generated', 'help.generated.json')),
    ).toBe(`${JSON.stringify(built.help, null, 2)}\n`);
    expect(normalizeEol(read('docs', 'manuales', 'help-index.json'))).toBe(
      `${JSON.stringify(built.index, null, 2)}\n`,
    );
  });

  it('cada manual tiene secciones H2/H3 con ancla única y hay capturas', () => {
    for (const m of HELP.manuals) {
      const anchors = m.sections.map((s) => s.anchor);
      expect(new Set(anchors).size).toBe(anchors.length);
      expect(m.sections.some((s) => s.level === 2)).toBe(true);
      expect(m.sections.some((s) => s.level === 3)).toBe(true);
    }
    expect(Object.keys(HELP.images).length).toBeGreaterThan(0);
  });

  it('el índice para el back: ids manual#ancla, url y texto plano', () => {
    const { index } = built;
    expect(
      index.sections.every(
        (s) => s.id === `${s.manual}#${s.anchor}` && s.url === `/ayuda/${s.manual}#${s.anchor}`,
      ),
    ).toBe(true);
    const s = index.sections.find((x) => x.id === 'admin#cómo-creo-un-usuario');
    expect(s?.plainText.length).toBeGreaterThan(50);
    expect(index.slugAlgorithm).toBe('github-slugger@2.0.0');
  });

  it('los enlaces de la app a la ayuda apuntan a anclas que existen', () => {
    const [path, anchor] = HELP_EASY_READ_HREF.replace('/ayuda/', '').split('#');
    const manual = HELP.manuals.find((m) => m.id === path);
    expect(manual?.sections.some((s) => s.anchor === anchor)).toBe(true);
  });
});
