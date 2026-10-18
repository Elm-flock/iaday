#!/usr/bin/env node
/**
 * Genera la ayuda de la app a partir de `docs/manuales/*.md` (corre en predev/prebuild y a mano:
 * `npm run help:build`). Salidas:
 *   - src/app/(app)/ayuda/_generated/help.generated.json   AST + secciones (lo lee SOLO el servidor)
 *   - docs/manuales/help-index.json                        índice plano para el asistente del back
 *   - public/ayuda/img/*.png                               capturas referenciadas (gitignored, se copian)
 * `--check` no escribe nada: falla (exit 1) si lo generado en disco no coincide con las fuentes.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANUALS, buildHelp } from './help/lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PATHS = {
  manuals: join(root, 'docs', 'manuales'),
  images: join(root, 'docs', 'manual', 'img'),
  generated: join(root, 'src', 'app', '(app)', 'ayuda', '_generated', 'help.generated.json'),
  index: join(root, 'docs', 'manuales', 'help-index.json'),
  publicImages: join(root, 'public', 'ayuda', 'img'),
};

const sources = Object.fromEntries(
  MANUALS.map((m) => [m.id, readFileSync(join(PATHS.manuals, m.file), 'utf8')]),
);
const { help, index, images } = buildHelp(sources, (f) => readFileSync(join(PATHS.images, f)));
const json = (o) => `${JSON.stringify(o, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const stale = [
    [PATHS.generated, help],
    [PATHS.index, index],
  ].filter(([p, o]) => !existsSync(p) || readFileSync(p, 'utf8') !== json(o));
  if (stale.length) {
    console.error('La ayuda generada está desactualizada. Corré `npm run help:build`.');
    process.exit(1);
  }
} else {
  mkdirSync(dirname(PATHS.generated), { recursive: true });
  writeFileSync(PATHS.generated, json(help));
  writeFileSync(PATHS.index, json(index));
  mkdirSync(PATHS.publicImages, { recursive: true });
  for (const f of images) copyFileSync(join(PATHS.images, f), join(PATHS.publicImages, f));
  console.log(
    `ayuda: ${help.manuals.map((m) => `${m.id} (${m.sections.length} secciones)`).join(', ')}; ${images.length} imágenes`,
  );
}
