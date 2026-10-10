import { CycleSelect, type CycleOption } from './cycle-select';
import { DownloadReportButton } from './download-report-button';
import { MembersManager, type Candidate } from './members-manager';
import { OriginMixIndicator } from './origin-mix-indicator';
import { Card } from '@/components/ui/card';
import type { components } from '@/lib/api/schema';

type TeamDetail = components['schemas']['TeamDetailDto'];

/** Detalle del equipo: mezcla de origen del ciclo elegido + integrantes. Presentacional. */
export function TeamDetailView({
  team,
  cycleOptions,
  selectedCycleId,
  canManage,
  canDownloadReport,
  candidates,
}: {
  team: TeamDetail;
  cycleOptions: CycleOption[];
  selectedCycleId: string | undefined;
  canManage: boolean;
  /** Solo ADMIN o líder del equipo; el resto no ve el botón (el back respondería 403). */
  canDownloadReport: boolean;
  candidates: Candidate[];
}) {
  return (
    <div className="flex flex-col gap-s20">
      <Card title="Mezcla de objetivos (50/50)">
        <div className="flex flex-col gap-s20">
          <div className="flex flex-wrap items-end justify-between gap-s20">
            <CycleSelect options={cycleOptions} selectedId={selectedCycleId} />
            {canDownloadReport ? (
              <DownloadReportButton teamId={team.id} cycleId={selectedCycleId} />
            ) : null}
          </div>
          <OriginMixIndicator mix={team.originMix} />
        </div>
      </Card>
      <MembersManager
        teamId={team.id}
        members={team.members}
        candidates={candidates}
        canManage={canManage}
      />
    </div>
  );
}
