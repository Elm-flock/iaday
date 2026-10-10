import React from "react";
import { Page, View, Text, Svg, Path, Circle, Rect, Defs, LinearGradient, Stop } from "@react-pdf/renderer";
import { C } from "./tokens";
import { fmtDate, fmtDecimalStr, fmtPct, fmtScore } from "./format";
import type { Band } from "./report-types";

const FF = "PublicSans";
const BAND: Record<Band, { word: string; color: string; bg: string }> = {
  GREEN: { word: "En ruta", color: C.success, bg: C.successBg },
  YELLOW: { word: "Requiere atención", color: C.warning, bg: C.warningBg },
  RED: { word: "En riesgo", color: C.danger, bg: C.dangerBg },
};
// Icon + word, never color alone. Shapes drawn as SVG because Public Sans has no U+25CF/U+25B2 glyphs.
function BandIcon({ band }: { band: Band }) {
  const col = BAND[band].color;
  return (
    <Svg width={9} height={9} viewBox="0 0 10 10">
      {band === "GREEN" && <Circle cx={5} cy={5} r={4.5} fill={col} />}
      {band === "YELLOW" && <Path d="M5 0.5 L9.5 9 L0.5 9 Z" fill={col} />}
      {band === "RED" && <Rect x={0.5} y={0.5} width={9} height={9} fill={col} />}
    </Svg>
  );
}
export function BandBadge({ band, score }: { band: Band; score?: number }) {
  const b = BAND[band];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: b.bg, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 }}>
      <BandIcon band={band} />
      <Text style={{ fontSize: 8, color: b.color, fontWeight: 700 }}>{b.word}{score != null ? ` · ${fmtScore(score)}` : ""}</Text>
    </View>
  );
}

type P<T> = { element: { props: T }; children?: React.ReactNode };

// Override of the standard Page: standard hardcodes fontFamily "Helvetica" and has no `fixed` footer.
function PageC({ element, children }: P<Record<string, unknown>>) {
  const p = element.props as { footerLeft?: string };
  return (
    <Page size="A4" style={{ paddingTop: 36, paddingBottom: 48, paddingHorizontal: 36, fontFamily: FF, fontSize: 10, color: C.ink, backgroundColor: "#ffffff" }}>
      {children}
      <View fixed style={{ position: "absolute", bottom: 20, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 8, color: C.subtle }}>{p.footerLeft ?? ""}</Text>
        <Text style={{ fontSize: 8, color: C.subtle }} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
      </View>
    </Page>
  );
}

// Brand header with "Noche" gradient (purple -> night) via SVG LinearGradient
function BrandHeader({ element }: P<{ title: string; subtitle: string; meta: string }>) {
  const p = element.props;
  return (
    <View style={{ height: 78, marginBottom: 14, borderRadius: 8, overflow: "hidden" }}>
      <Svg width={523} height={78} style={{ position: "absolute", top: 0, left: 0 }}>
        <Defs>
          <LinearGradient id="noche" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#7f07c5" />
            <Stop offset="1" stopColor="#1c002c" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={523} height={78} fill="url(#noche)" />
      </Svg>
      <View style={{ padding: 14 }}>
        <Text style={{ fontSize: 8, color: "#e9deff", letterSpacing: 1 }}>REPORTE DE EQUIPO</Text>
        <Text style={{ fontSize: 20, fontWeight: 300, color: "#ffffff", letterSpacing: 0.9, marginTop: 2 }}>{p.title}</Text>
        <Text style={{ fontSize: 9, color: "#e9deff", marginTop: 4 }}>{p.subtitle}  ·  {p.meta}</Text>
      </View>
    </View>
  );
}

function OriginMix({ element }: P<{ topDown: number; bottomUp: number; ratio: number | null; warning: boolean }>) {
  const p = element.props;
  return (
    <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 10, marginBottom: 12 }} wrap={false}>
      <Text style={{ fontSize: 11, fontWeight: 700 }}>Mezcla de origen</Text>
      <Text style={{ fontSize: 9, color: C.muted, marginTop: 3 }}>
        De arriba hacia abajo: {p.topDown}  ·  De abajo hacia arriba: {p.bottomUp}  ·  {p.ratio == null ? "Sin objetivos" : `${fmtPct(p.ratio)} de abajo hacia arriba`}
      </Text>
      {p.warning && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
          <BandIcon band="YELLOW" />
          <Text style={{ fontSize: 9, color: C.warning }}>Fuera del rango sugerido de 40 % a 60 % (solo indicador).</Text>
        </View>
      )}
    </View>
  );
}

type KR = { title: string; scoring: string; unit: string | null; start: string | null; target: string | null; current: string | null; score: number; band: Band; lastCheckInAt: string | null };
function ObjectiveBlock({ element }: P<{ title: string; type: string; origin: string; status: string; score: number; band: Band; finalScore: number | null; achieved: boolean | null; keyResults: KR[] }>) {
  const o = element.props;
  const u = (k: KR) => (k.unit ? ` ${k.unit}` : "");
  return (
    <View wrap={false} style={{ borderWidth: 1, borderColor: C.border, borderRadius: 6, marginBottom: 8 }}>
      <View wrap={false} style={{ backgroundColor: C.subtleBg, padding: 8, borderTopLeftRadius: 6, borderTopRightRadius: 6 }}>
        <Text style={{ fontSize: 10.5, fontWeight: 700 }}>{o.title}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
          <BandBadge band={o.band} score={o.score} />
          <Text style={{ fontSize: 8, color: C.muted }}>
            {o.type === "COMMITTED" ? "Comprometido" : "Aspiracional"} · {o.origin === "TOP_DOWN" ? "De arriba hacia abajo" : "De abajo hacia arriba"} · {o.status === "CLOSED" ? "Cerrado" : "Publicado"}
            {o.finalScore != null ? ` · Final ${fmtScore(o.finalScore)} (${o.achieved ? "Logrado" : "No logrado"})` : ""}
          </Text>
        </View>
      </View>
      {o.keyResults.map((k, i) => (
        <View key={i} wrap={false} style={{ flexDirection: "row", alignItems: "flex-start", padding: 6, borderTopWidth: i ? 1 : 0, borderTopColor: C.border }}>
          <View style={{ flex: 5 }}>
            <Text style={{ fontSize: 9 }}>{k.title}</Text>
            <Text style={{ fontSize: 8, color: C.muted, marginTop: 1 }}>
              Inicio {fmtDecimalStr(k.start)} · Meta {fmtDecimalStr(k.target)}{u(k)} · Actual {fmtDecimalStr(k.current)}{u(k)}
            </Text>
          </View>
          <View style={{ flex: 2, alignItems: "flex-end" }}>
            <BandBadge band={k.band} score={k.score} />
            <Text style={{ fontSize: 7.5, color: C.subtle, marginTop: 2 }}>{k.lastCheckInAt ? `Último check-in ${fmtDate(k.lastCheckInAt)}` : "Sin check-ins"}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function SectionTitle({ element }: P<{ text: string; level: "h2" | "h3" }>) {
  const p = element.props;
  return (
    <Text minPresenceAhead={200} style={{ fontSize: p.level === "h2" ? 14 : 11.5, fontWeight: p.level === "h2" ? 300 : 700, letterSpacing: p.level === "h2" ? 0.9 : 0, marginTop: 10, marginBottom: 6, color: p.level === "h2" ? C.night : C.purple }}>
      {p.text}
    </Text>
  );
}

export const customRegistry = { Page: PageC, BrandHeader, OriginMix, ObjectiveBlock, SectionTitle } as Record<string, React.ComponentType<any>>;
