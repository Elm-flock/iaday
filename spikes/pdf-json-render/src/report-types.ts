// Mirror of okr-platform-back src/reports/dto/team-report.dto.ts (Date may arrive as ISO string over the wire)
export type Band = "RED" | "YELLOW" | "GREEN";
export type DateLike = Date | string;
export interface ReportKeyResult {
  id: string; title: string; scoring: "DERIVED" | "MANUAL"; unit: string | null;
  startValue: string | null; targetValue: string | null; currentValue: string | null;
  score: number; band: Band; lastCheckInAt: DateLike | null;
}
export interface ReportObjective {
  id: string; title: string; type: "COMMITTED" | "ASPIRATIONAL"; origin: "TOP_DOWN" | "BOTTOM_UP";
  status: "PUBLISHED" | "CLOSED"; score: number; band: Band; finalScore: number | null;
  achieved: boolean | null; keyResults: ReportKeyResult[];
}
export interface TeamReportDto {
  team: { id: string; name: string };
  cycle: { id: string; name: string; kind: "ANNUAL" | "QUARTER"; status: "DRAFT" | "ACTIVE" | "CLOSED"; committedThreshold: number; aspirationalThreshold: number };
  generatedAt: DateLike;
  originMix: { topDown: number; bottomUp: number; bottomUpRatio: number | null; warning: boolean };
  teamObjectives: ReportObjective[];
  members: { userId: string; name: string; objectives: ReportObjective[] }[];
}
