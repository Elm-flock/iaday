import { ArrowRight, Award } from 'lucide-react';
import NextLink from 'next/link';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/format';

export type RecognitionItem = {
  id: string;
  fromName: string;
  toName: string;
  message: string;
  createdAt: string;
};

function List({ label, items, empty }: { label: string; items: RecognitionItem[]; empty: string }) {
  return (
    <section aria-label={label}>
      <h4 className="mb-s10 text-body font-bold text-ink-muted">{label}</h4>
      {items.length === 0 ? (
        <p className="text-body-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-s10">
          {items.map((r) => (
            <li key={r.id} className="rounded-md border border-border bg-surface p-s10">
              <p className="flex flex-wrap items-center gap-s5 text-body-sm text-ink">
                <span className="font-bold">{r.fromName}</span>
                <ArrowRight
                  size={14}
                  strokeWidth={1.75}
                  aria-label="reconoció a"
                  className="text-ink-muted"
                />
                <span className="font-bold">{r.toName}</span>
                <time dateTime={r.createdAt} className="ml-auto text-caption text-ink-muted">
                  {formatDate(r.createdAt)}
                </time>
              </p>
              <p className="mt-s5 line-clamp-2 text-body-sm text-ink">{r.message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Últimos reconocimientos que recibí y últimos del muro. Sin conteos ni comparaciones entre personas. */
export function RecognitionsCard({
  received,
  wall,
}: {
  received: RecognitionItem[];
  wall: RecognitionItem[];
}) {
  return (
    <Card
      title="Reconocimientos recientes"
      aria-label="Reconocimientos recientes"
      actions={
        <NextLink
          href="/reconocimientos"
          className="text-body-sm text-primary-text underline underline-offset-2"
        >
          Ver el muro
        </NextLink>
      }
    >
      {received.length === 0 && wall.length === 0 ? (
        <EmptyState
          icon={<Award size={32} strokeWidth={1.75} aria-hidden="true" />}
          title="Todavía no hay reconocimientos"
          description="Cuando alguien reconozca un logro, lo vas a ver acá."
        />
      ) : (
        <div className="flex flex-col gap-s20">
          <List label="Para vos" items={received} empty="Todavía no recibiste reconocimientos." />
          <List label="En el muro" items={wall} empty="El muro todavía está vacío." />
        </div>
      )}
    </Card>
  );
}
