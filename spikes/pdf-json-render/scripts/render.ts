import fs from "node:fs";
import { renderTeamReportPdf } from "../src/render-team-report";
import { sampleReport } from "../src/fixture";

const small = await renderTeamReportPdf(sampleReport(3, 2, 3));
fs.writeFileSync("out/team-report.pdf", small);
const big = await renderTeamReportPdf(sampleReport(8, 3, 3));
fs.writeFileSync("out/team-report-large.pdf", big);
console.log("small", small.length, small.subarray(0, 5).toString(), "large", big.length);
