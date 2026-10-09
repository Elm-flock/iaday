import { CheckInTimeline } from './check-in-timeline';
import { Card } from '@/components/ui/card';
import type { CheckIn } from '@/lib/dal/check-ins';
import type { KeyResult } from '@/lib/dal/objectives';

type Props = {
  keyResults: Pick<KeyResult, 'id' | 'title' | 'unit'>[];
  /** Historial por id de KR (más nuevo primero). */
  history: Map<string, CheckIn[]>;
  names: Map<string, string>;
};

/** Historial de check-ins de todos los KRs del objetivo. Presentacional. */
export function KrHistoryCard({ keyResults, history, names }: Props) {
  return (
    <Card title="Historial de check-ins">
      <div className="flex flex-col gap-s20">
        {keyResults.map((kr) => (
          <section
            key={kr.id}
            aria-label={`Historial de ${kr.title}`}
            className="flex flex-col gap-s10"
          >
            <h4 className="text-body font-bold text-ink">{kr.title}</h4>
            <CheckInTimeline checkIns={history.get(kr.id) ?? []} names={names} unit={kr.unit} />
          </section>
        ))}
      </div>
    </Card>
  );
}
