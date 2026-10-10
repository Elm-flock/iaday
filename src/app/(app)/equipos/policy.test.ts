import { describe, expect, it } from 'vitest';
import { canDownloadTeamReport, type TeamViewer } from './policy';

const viewer = (role: TeamViewer['role'], teams: TeamViewer['teams'] = []): TeamViewer => ({
  role,
  teams,
});

const membership = (teamId: string, isLead: boolean): TeamViewer['teams'][number] => ({
  teamId,
  name: teamId,
  isLead,
});

describe('canDownloadTeamReport', () => {
  it('ADMIN siempre, sin importar si integra el equipo', () => {
    expect(canDownloadTeamReport(viewer('ADMIN'), 't1')).toBe(true);
  });

  it('líder del equipo exacto', () => {
    expect(canDownloadTeamReport(viewer('LEADER', [membership('t1', true)]), 't1')).toBe(true);
  });

  it('líder de otro equipo no', () => {
    expect(canDownloadTeamReport(viewer('LEADER', [membership('t2', true)]), 't1')).toBe(false);
  });

  it('integrante (no líder) del equipo no', () => {
    expect(canDownloadTeamReport(viewer('MEMBER', [membership('t1', false)]), 't1')).toBe(false);
  });

  it('un LEADER que en este equipo es integrante no', () => {
    expect(
      canDownloadTeamReport(
        viewer('LEADER', [membership('t1', false), membership('t2', true)]),
        't1',
      ),
    ).toBe(false);
  });

  it('sin equipos no', () => {
    expect(canDownloadTeamReport(viewer('MEMBER'), 't1')).toBe(false);
  });
});
