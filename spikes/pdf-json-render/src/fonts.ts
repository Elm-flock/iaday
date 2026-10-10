import path from "node:path";
import { Font } from "@react-pdf/renderer";

let done = false;
/** Registers Public Sans (Flock UI fallback for Tomato Grotesk). Idempotent. woff works; woff2 is NOT supported by react-pdf. */
export function registerFonts() {
  if (done) return;
  const dir = path.join(process.cwd(), "node_modules/@fontsource/public-sans/files");
  const f = (w: number) => path.join(dir, `public-sans-latin-${w}-normal.woff`);
  Font.register({
    family: "PublicSans",
    fonts: [
      { src: f(300), fontWeight: 300 },
      { src: f(400), fontWeight: 400 },
      { src: f(700), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((w) => [w]); // no mid-word hyphenation
  done = true;
}
