// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { kr, objective, report } from './fixtures';
import { renderTeamReportPdf } from './render-team-report-pdf';

describe('renderTeamReportPdf (humo)', () => {
  it('devuelve un Buffer PDF válido', async () => {
    const pdf = await renderTeamReportPdf(
      report({
        teamObjectives: [objective({ keyResults: [kr({ lastCheckInAt: null })] })],
        originMix: { topDown: 3, bottomUp: 1, bottomUpRatio: 0.25, warning: true },
      }),
    );
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2_000);
  }, 30_000);

  it('renderiza un reporte vacío sin romper', async () => {
    const pdf = await renderTeamReportPdf(report({ teamObjectives: [], members: [] }));
    expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
  }, 30_000);
});
