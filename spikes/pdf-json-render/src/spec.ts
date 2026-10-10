import type { Spec } from "@json-render/core";
import type { ReportObjective, TeamReportDto } from "./report-types";
import { fmtDate } from "./format";

const plainText = (text: string) => ({ text, fontSize: 9, color: "#5e4e6b", align: null, fontWeight: null, fontStyle: null, lineHeight: null });

export function buildTeamReportSpec(r: TeamReportDto): Spec {
  const elements: Spec["elements"] = {};
  const page: string[] = [];
  let n = 0;
  const add = (type: string, props: Record<string, unknown>, children: string[] = []) => {
    const id = `e${n++}`;
    elements[id] = { type, props, children };
    return id;
  };
  const objective = (o: ReportObjective) =>
    add("ObjectiveBlock", {
      title: o.title, type: o.type, origin: o.origin, status: o.status, score: o.score, band: o.band, finalScore: o.finalScore, achieved: o.achieved,
      keyResults: o.keyResults.map((k) => ({
        title: k.title, scoring: k.scoring, unit: k.unit, start: k.startValue, target: k.targetValue, current: k.currentValue,
        score: k.score, band: k.band, lastCheckInAt: k.lastCheckInAt ? new Date(k.lastCheckInAt).toISOString() : null,
      })),
    });

  page.push(add("BrandHeader", { title: r.team.name, subtitle: `Ciclo ${r.cycle.name}`, meta: `Generado el ${fmtDate(r.generatedAt)}` }));
  page.push(add("OriginMix", { topDown: r.originMix.topDown, bottomUp: r.originMix.bottomUp, ratio: r.originMix.bottomUpRatio, warning: r.originMix.warning }));
  page.push(add("SectionTitle", { text: "Objetivos del equipo", level: "h2" }));
  if (r.teamObjectives.length === 0) page.push(add("Text", plainText("El equipo no tiene objetivos en este ciclo.")));
  r.teamObjectives.forEach((o) => page.push(objective(o)));
  page.push(add("SectionTitle", { text: "Personas", level: "h2" }));
  // Alphabetical (es locale), NEVER by score
  [...r.members].sort((a, b) => a.name.localeCompare(b.name, "es")).forEach((m) => {
    page.push(add("SectionTitle", { text: m.name, level: "h3" }));
    if (m.objectives.length === 0) page.push(add("Text", plainText("Sin objetivos publicados en este ciclo.")));
    m.objectives.forEach((o) => page.push(objective(o)));
  });
  const pg = add("Page", { footerLeft: `${r.team.name} · ${r.cycle.name}` }, page);
  const doc = add("Document", { title: `Reporte de equipo - ${r.team.name} - ${r.cycle.name}`, author: "Flock OKR", subject: null }, [pg]);
  return { root: doc, elements };
}
