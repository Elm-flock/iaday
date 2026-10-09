import NextLink from 'next/link';
import { Card } from '@/components/ui/card';
import { ScoreBar } from '@/components/ui/score-bar';
import { BandBadge } from '@/components/ui/status-badge';
import type { Objective } from '@/lib/dal/objectives';
import { ObjectiveStatusBadge, ObjectiveTags } from './objective-meta';

type Related = { id: string; title: string; status: Objective['status']; ownerName: string };

function RelatedLink({ item }: { item: Related }) {
  return (
    <li>
      <NextLink
        href={`/objetivos/${item.id}`}
        className="flex flex-wrap items-center gap-s10 rounded-md px-s10 py-s5 text-body text-primary-text underline underline-offset-2 hover:bg-surface-subtle"
      >
        <span>{item.title}</span>
        <span className="text-body-sm text-ink-muted no-underline">· {item.ownerName}</span>
      </NextLink>
    </li>
  );
}

/** Ficha del objetivo + alineación (padre e hijos). Presentacional; las KRs y las acciones son hojas cliente. */
export function ObjectiveDetailView({
  objective,
  ownerName,
  cycleName,
  parent,
  aligned,
}: {
  objective: Objective;
  ownerName: string;
  cycleName: string;
  parent: Related | null;
  aligned: Related[];
}) {
  return (
    <div className="flex flex-col gap-s20">
      <Card title="Resumen">
        <div className="flex flex-col gap-s15">
          <div className="flex flex-wrap items-center gap-s10">
            <ObjectiveStatusBadge status={objective.status} />
            <ObjectiveTags objective={objective} />
          </div>
          <dl className="grid grid-cols-1 gap-s15 sm:grid-cols-2">
            <div className="flex flex-col gap-s5">
              <dt className="text-body-sm text-ink-muted">Responsable</dt>
              <dd className="text-body text-ink">{ownerName}</dd>
            </div>
            <div className="flex flex-col gap-s5">
              <dt className="text-body-sm text-ink-muted">Ciclo</dt>
              <dd className="text-body text-ink">{cycleName}</dd>
            </div>
          </dl>
          {objective.description ? (
            <p className="whitespace-pre-line text-body text-ink">{objective.description}</p>
          ) : (
            <p className="text-body text-ink-muted">Sin descripción.</p>
          )}
          {objective.status === 'DRAFT' ? (
            <p className="text-body-sm text-ink-muted">
              Es un borrador: solo lo ven quienes pueden editarlo y todavía no tiene puntaje.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-s15">
              <BandBadge score={objective.score} />
              <ScoreBar
                score={objective.score}
                label={`Score de ${objective.title}`}
                className="min-w-48 max-w-md flex-1"
              />
            </div>
          )}
        </div>
      </Card>

      <Card title="Alineación">
        <div className="flex flex-col gap-s15">
          <div className="flex flex-col gap-s5">
            <h4 className="text-body-sm text-ink-muted">Se alinea a</h4>
            {parent ? (
              <ul>
                <RelatedLink item={parent} />
              </ul>
            ) : (
              <p className="text-body text-ink-muted">No está alineado a otro objetivo.</p>
            )}
          </div>
          <div className="flex flex-col gap-s5">
            <h4 className="text-body-sm text-ink-muted">Objetivos alineados a este</h4>
            {aligned.length > 0 ? (
              <ul>
                {aligned.map((c) => (
                  <RelatedLink key={c.id} item={c} />
                ))}
              </ul>
            ) : (
              <p className="text-body text-ink-muted">Ningún objetivo se alinea a este todavía.</p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
