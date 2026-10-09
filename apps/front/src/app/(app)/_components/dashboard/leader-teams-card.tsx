import { Users } from 'lucide-react';
import NextLink from 'next/link';
import { originMixShares } from '../../equipos/team-tree';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import type { LedTeam } from '@/lib/dal/dashboard';
import { formatPercent } from '@/lib/format';

/** "Mis equipos" (solo líderes): el indicador 50/50 del ciclo de cada equipo que lidero y el enlace al equipo. */
export function LeaderTeamsCard({ teams, cycleId }: { teams: LedTeam[]; cycleId: string }) {
  return (
    <Card title="Mis equipos" aria-label="Mis equipos">
      {teams.length === 0 ? (
        <EmptyState
          icon={<Users size={32} strokeWidth={1.75} aria-hidden="true" />}
          title="No liderás ningún equipo"
          description="Cuando te asignen como líder de un equipo, vas a ver acá su mezcla de objetivos."
        />
      ) : (
        <ul className="flex flex-col gap-s10">
          {teams.map((team) => {
            const shares = team.originMix ? originMixShares(team.originMix) : null;
            return (
              <li key={team.id}>
                <NextLink
                  href={`/equipos/${team.id}?cycleId=${cycleId}`}
                  className="flex flex-wrap items-center gap-s10 rounded-md border border-border bg-surface p-s15 transition-colors duration-150 hover:border-border-strong hover:bg-surface-subtle"
                >
                  <span className="flex-1 text-body font-bold text-ink">{team.name}</span>
                  {shares && team.originMix ? (
                    <>
                      <span className="text-body-sm text-ink-muted">
                        Top-down {formatPercent(shares.topDown)} · Bottom-up{' '}
                        {formatPercent(shares.bottomUp)}
                      </span>
                      <StatusBadge tone={team.originMix.warning ? 'warning' : 'success'}>
                        {team.originMix.warning ? 'Fuera del rango 40–60 %' : 'Equilibrado'}
                      </StatusBadge>
                    </>
                  ) : (
                    <span className="text-body-sm text-ink-muted">Sin objetivos en este ciclo</span>
                  )}
                </NextLink>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
