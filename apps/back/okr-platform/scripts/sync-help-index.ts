/**
 * Copia (NO regenera) el índice de ayuda canónico que emite el front
 * (`okr-platform-front/docs/manuales/help-index.json`, script `manuals:build`) a
 * `src/assistant/help/help-index.json`. El back no parsea Markdown ni calcula anclas: las del front mandan.
 *
 * Uso: `npm run assistant:help-index [-- <ruta/al/help-index.json>]`
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(__dirname, '..');
const source = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(root, '../../okr-platform-front/docs/manuales/help-index.json');
const target = join(root, 'src/assistant/help/help-index.json');

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`help-index.json copiado desde ${source}`);
