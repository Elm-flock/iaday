import type { Band, ReportObjective, TeamReportDto } from "./report-types";
const band = (s: number): Band => (s >= 0.7 ? "GREEN" : s >= 0.4 ? "YELLOW" : "RED");
function obj(i: number, k: number, owner: string): ReportObjective {
  const s = ((i * 7 + k * 3) % 10) / 10;
  const closed = i % 4 === 0;
  return {
    id: `${owner}-o${i}`, title: `Objetivo ${i + 1} de ${owner}: mejorar la experiencia y la adopción del producto en el trimestre`,
    type: i % 2 ? "ASPIRATIONAL" : "COMMITTED", origin: i % 3 ? "BOTTOM_UP" : "TOP_DOWN",
    status: closed ? "CLOSED" : "PUBLISHED", score: s, band: band(s), finalScore: closed ? s : null, achieved: closed ? s >= 0.7 : null,
    keyResults: Array.from({ length: k }, (_, j) => {
      const ks = ((i + j * 4) % 11) / 10;
      return { id: `${owner}-o${i}-k${j}`, title: `Resultado clave ${j + 1}: aumentar la retención de usuarios activos`, scoring: j % 2 ? "MANUAL" : "DERIVED",
        unit: j % 2 ? "%" : "usuarios", startValue: "1000", targetValue: "12345.5", currentValue: String(1000 + ks * 11345.5),
        score: ks, band: band(ks), lastCheckInAt: j === 2 ? null : "2026-10-05T15:30:00.000Z" };
    }),
  };
}
export function sampleReport(members = 3, objs = 2, krs = 3): TeamReportDto {
  const names = ["Ángela Peña", "Bruno Núñez", "Carolina Ibáñez", "Darío Gómez", "Eugenia Ruiz", "Fabián Sosa", "Gisela Muñoz", "Hernán Álvarez"];
  return {
    team: { id: "t1", name: "Plataforma y Experiencia Digital" },
    cycle: { id: "c1", name: "Q4 2026", kind: "QUARTER", status: "ACTIVE", committedThreshold: 1, aspirationalThreshold: 0.7 },
    generatedAt: new Date().toISOString(),
    originMix: { topDown: 5, bottomUp: 3, bottomUpRatio: 0.375, warning: true },
    teamObjectives: Array.from({ length: objs }, (_, i) => obj(i, krs, "equipo")),
    members: names.slice(0, members).map((name, m) => ({ userId: `u${m}`, name, objectives: Array.from({ length: objs }, (_, i) => obj(i + m, krs, name.split(" ")[0])) })),
  };
}
