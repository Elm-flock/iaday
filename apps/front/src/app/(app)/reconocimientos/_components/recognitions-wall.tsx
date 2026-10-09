import { Award } from 'lucide-react';
import NextLink from 'next/link';
import { RecognitionCard, type CardMilestone } from './recognition-card';
import { buttonStyles } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';

export type WallItem = {
  id: string;
  fromName: string;
  toName: string;
  message: string;
  createdAt: string;
  milestone: CardMilestone;
};

type Props = {
  items: WallItem[];
  people: { id: string; name: string }[];
  personId?: string;
  page: number;
  pages: number;
};

const hrefFor = (page: number, personId?: string) => {
  const q = new URLSearchParams();
  if (personId) q.set('persona', personId);
  if (page > 1) q.set('page', String(page));
  const s = q.toString();
  return s ? `/reconocimientos?${s}` : '/reconocimientos';
};

/** Muro público: filtro por persona (GET, sin JS), tarjetas del más nuevo al más viejo y paginado. */
export function RecognitionsWall({ items, people, personId, page, pages }: Props) {
  return (
    <div className="flex flex-col gap-s20">
      <form method="get" className="flex flex-wrap items-end gap-s10">
        <FormField label="Filtrar por persona" className="w-72 max-w-full">
          <Select name="persona" defaultValue={personId ?? ''}>
            <option value="">Todas las personas</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FormField>
        <button type="submit" className={buttonStyles({ variant: 'secondary' })}>
          Filtrar
        </button>
        {personId ? (
          <NextLink href="/reconocimientos" className={buttonStyles({ variant: 'ghost' })}>
            Quitar filtro
          </NextLink>
        ) : null}
      </form>

      {items.length === 0 ? (
        <EmptyState
          title={
            personId
              ? 'Todavía no hay reconocimientos para esta persona'
              : 'Todavía no hay reconocimientos'
          }
          description="Cuando alguien reconozca un logro de otra persona, va a aparecer acá. Un reconocimiento específico vale más que un aplauso genérico."
          icon={<Award size={32} strokeWidth={1.75} aria-hidden="true" />}
        />
      ) : (
        <ul
          className="flex flex-col gap-s15"
          aria-label="Reconocimientos, del más nuevo al más viejo"
        >
          {items.map((item) => (
            <li key={item.id}>
              <RecognitionCard {...item} />
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label="Paginación" className="flex items-center justify-between gap-s10">
          {page > 1 ? (
            <NextLink
              href={hrefFor(page - 1, personId)}
              className={buttonStyles({ variant: 'secondary' })}
            >
              Anterior
            </NextLink>
          ) : (
            <span />
          )}
          <span className="text-body-sm text-ink-muted">
            Página {page} de {pages}
          </span>
          {page < pages ? (
            <NextLink
              href={hrefFor(page + 1, personId)}
              className={buttonStyles({ variant: 'secondary' })}
            >
              Siguiente
            </NextLink>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
