# Spike 9.1 - Team PDF with @json-render/react-pdf (2026-10-09)

Status: SUCCESS. Recommendation: use `@json-render/react-pdf` (thin layer over `@react-pdf/renderer`) with a custom registry, OR plain react-pdf (see "Recommendation").

## Pinned versions (all exact, see package.json)
| Package | Version | Notes |
|---|---|---|
| next | 16.4.0 | same as front |
| react / react-dom | 19.3.0 | same as front |
| typescript | ^5 resolved by npm (front uses ^5) | |
| @json-render/core | 0.21.0 | Apache-2.0, published 2026-09-18, peer `zod ^4` |
| @json-render/react-pdf | 0.21.0 | Apache-2.0, published 2026-09-18 (created 2026-02-20, 0.7.0 -> 0.21.0, ~15 minors in 7 months = fast-moving, pre-1.0), peer `react ^18 || ^19`, `zod ^4`; deps: `@json-render/core` (exact 0.21.0), `@react-pdf/renderer ^4.3.2` (resolved 4.9.0) |
| zod | 4.6.5 (required peer) | front would need to add zod 4 |
| @fontsource/public-sans | latest at install (pin in package.json) | woff files for Public Sans 300/400/700 |
Repo: github.com/vercel-labs/json-render (npm metadata; GitHub not fetched).

## Verified API (from installed .d.ts / dist source)
- Spec: `{ root: string, elements: Record<id, { type, props, children: string[], visible?, repeat? }>, state? }` (flat tree).
- Standard components: Document(title,author,subject), Page(size,orientation,margins,backgroundColor), View, Row, Column, Heading(text,level h1-h4,color,align), Text(text,fontSize,color,align,fontWeight normal|bold,fontStyle,lineHeight), Image(src,width,height,objectFit), Link, Table(columns[{header,width,align}], rows: string[][], header colors, striped), List, Divider, Spacer, PageNumber. All props are zod `.nullable()` and REQUIRED to be present (pass `null`).
- Server API: `import { renderToBuffer, renderToStream, renderToFile } from "@json-render/react-pdf"` (or the lighter `/render` subpath, which I used). `renderToBuffer(spec, {registry?, includeStandard?, state?}): Promise<Uint8Array>` (NOT Buffer - wrap with `Buffer.from`). `renderToStream(...) : Promise<ReadableStream>` (README example uses `.pipe`, but typed as web ReadableStream).
- Custom components: `options.registry` is a plain `Record<type, ReactComponent>` merged OVER standard ones (custom `Page` overrides standard). Component props: `{ element: { props }, children }`. `defineCatalog(schema, {...standardComponentDefinitions, X})` + `defineRegistry(catalog, {components})` exists, but typed `components` demands an implementation for EVERY catalog component (incl. standard) and its param is `ComponentContext` (README says `({props})`, not `element`) -> for the PDF use the untyped registry map; the catalog is only useful for LLM prompt/validation, which we do not need.
- Dynamic props (`$state`, `$cond`, `repeat`) exist; not needed (backend gives full data).
- Fonts: NO font props in standard components. Standard `Page` hardcodes `fontFamily: "Helvetica", fontSize 12`, standard Text strips emojis (U+2600-26FF etc., so no "warning" glyph). To use Public Sans: `Font.register` from `@react-pdf/renderer` (same instance, hoisted dep) + override `Page` in registry. Works. Only .ttf/.woff (NOT woff2).
- Gradients: not in standard components; achieved via custom component with `<Svg><Defs><LinearGradient>` (react-pdf SVG). Works ("Noche" band rendered correctly).
- Standard Table is strings-only (no icon/colored cells) -> insufficient for status icon+word; I built custom `ObjectiveBlock`.

## Next.js config findings (next dev + Turbopack, port 3200, cacheComponents: true)
- `serverExternalPackages` NOT required in dev: route returned `200 application/pdf`, body starts `%PDF-1.3`, with and without it. NOTE: not verified under `next build` (user rule: never build) - first `next build` in the front should re-check; if bundling fails add `serverExternalPackages: ["@react-pdf/renderer"]` (react-pdf is a known candidate).
- `export const runtime = "nodejs"` in the route handler is a HARD ERROR with `cacheComponents: true` ("Route segment config 'runtime' is not compatible with nextConfig.cacheComponents"). Omit it; Node runtime is default.
- Route Handler runs fine with `cacheComponents` (it read `req.url`; dynamic). `new Date()` inside is OK there.
- No ESM/CJS problems: json-render ships dual ESM/CJS (`exports` import/require); worked from tsx (ESM, `"type":"module"`) and Next.
- Font path: used `path.join(process.cwd(), "node_modules/@fontsource/public-sans/files/...woff")`. In prod/Docker ensure the font files exist at runtime (commit TTFs under e.g. `assets/fonts` and reference via process.cwd(), or add `outputFileTracingIncludes`). 
- `next dev` auto-modified tsconfig.json and generated AGENTS.md (spike only).

## Visual verification (PyMuPDF render, 90 dpi)
Files: `out/team-report.pdf` (3 members, 3 pages), `out/team-report-large.pdf` (8 members x 3 obj x 3 KR, 9 pages), `out/team-report-p1.png` (page 1), plus route outputs `out/api1.pdf`, `out/api-big.pdf`.
Renders well: gradient header (Noche), Public Sans (embedded subsets, 300 title), accents/ñ/Á, AR numbers (`1.000`, `12.345,5`, `0,90`, `38 %`), dates dd/mm/aaaa, icon+word badges (circle "En ruta", triangle "Requiere atención", square "En riesgo", drawn with SVG), "Sin check-ins" neutral text, footer "Página X de Y" via fixed `render` Text, members alphabetical.
Issues found and fixed:
1. Public Sans latin woff lacks U+2192 (arrow) and U+25CF/25B2 glyphs: arrow rendered as a stray quote and Helvetica fallback was embedded -> replaced the arrow with words, drew status icons as SVG. Avoid any non-Latin-1 symbol in text (· U+00B7 is fine).
2. Orphan heading at page bottom: breakable bordered View + `minPresenceAhead` 60 was not enough -> made `ObjectiveBlock` `wrap={false}` and `minPresenceAhead={200}` on section titles; verified on 9-page doc that no page ends in a heading.
3. Standard Page hardcodes Helvetica -> overridden.
Performance: ~1.6 s first request (dev), 9-page doc ~63 KB.

## Fallback comparison
Plain `@react-pdf/renderer` (proof `scripts/plain-react-pdf.tsx`, `out/plain.pdf`) is the exact engine; json-render adds only: JSON spec tree, 15 stock components, zod catalog, state/visibility/repeat. For us the stock components were insufficient (Table text-only, no fonts, no gradient, Page hardcoded) so ALL meaningful rendering is custom React-PDF code anyway (~150 lines).
Recommendation: json-render works and is stable enough for this spike, but its value is low here (spec data is server-built from a typed DTO, not LLM-generated), it is pre-1.0 with fast minors (0.7 -> 0.21 in 7 months), forces zod 4 and exposes a confusing typed `defineRegistry`. If the team values the spec layer as testable JSON (snapshot/unit test `buildTeamReportSpec` without rendering PDF) or plans future LLM-generated reports, keep json-render pinned to 0.21.0. Otherwise plain `@react-pdf/renderer` (pin 4.9.0) with a `<TeamReportDocument report={...}/>` component is simpler, fewer deps, equal output. Both are acceptable; the adapter signature is identical, so the choice is reversible.

## Adapter (src/render-team-report.ts)
```ts
import { renderToBuffer } from "@json-render/react-pdf/render";
import { registerFonts } from "./fonts";
import { customRegistry } from "./registry";
import { buildTeamReportSpec } from "./spec";
import type { TeamReportDto } from "./report-types";

export async function renderTeamReportPdf(report: TeamReportDto): Promise<Buffer> {
  registerFonts(); // Font.register PublicSans 300/400/700 (woff), idempotent
  const bytes = await renderToBuffer(buildTeamReportSpec(report), { registry: customRegistry });
  return Buffer.from(bytes);
}
```
Route handler (no `runtime` export with cacheComponents):
```ts
export async function GET(req: Request) {
  const pdf = await renderTeamReportPdf(await loadReport(req));
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf",
    "Content-Disposition": 'attachment; filename="reporte-equipo.pdf"', "Cache-Control": "no-store" } });
}
```
Run: `npm run script` (tsx -> out/*.pdf) ; `npx next dev -p 3200` then `curl localhost:3200/api/report`.
