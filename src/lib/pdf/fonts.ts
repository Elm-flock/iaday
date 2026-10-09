import path from 'node:path';
import { Font } from '@react-pdf/renderer';

export const PDF_FONT_FAMILY = 'PublicSans';
let registered = false;

/**
 * Registra Public Sans (respaldo de Tomato Grotesk) 300/400/700. Idempotente.
 * react-pdf solo acepta .ttf/.woff (NO woff2). Los .woff viven versionados en `./fonts` (licencia
 * OFL) y se incluyen en el trace del deploy con `outputFileTracingIncludes` (next.config.ts).
 */
export function registerPdfFonts(): void {
  if (registered) return;
  const dir = path.join(process.cwd(), 'src/lib/pdf/fonts');
  const file = (weight: number) => path.join(dir, `public-sans-latin-${weight}-normal.woff`);
  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: [
      { src: file(300), fontWeight: 300 },
      { src: file(400), fontWeight: 400 },
      { src: file(700), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]); // sin cortes de palabra
  registered = true;
}
