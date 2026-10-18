import { BookOpen } from 'lucide-react';
import NextLink from 'next/link';
import { HelpAnchors, PrintButton } from './help-client';
import { ManualContent } from './manual-content';
import { ManualToc } from './manual-toc';
import { MANUAL_LABEL, helpHref, type Manual } from '../help-data';
import {
  BACK_TO_HELP,
  HELP_INTRO,
  HELP_TITLE,
  MANUALS_HEADING,
  MANUALS_NAV_LABEL,
  MANUAL_DESCRIPTION,
  OPEN_MANUAL,
  SEARCH_BUTTON,
  SEARCH_CLEAR,
  SEARCH_EMPTY_HINT,
  SEARCH_LABEL,
  SEARCH_PLACEHOLDER,
  SKIP_TO_CONTENT,
  SKIP_TO_TOC,
  searchSummary,
  versionLine,
} from '../messages';
import type { SearchHit } from '../search';
import { Button, buttonStyles } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Link } from '@/components/ui/link';
import { PageHeader } from '@/components/ui/page-header';
import { TextInput } from '@/components/ui/text-input';

const skipLink =
  'sr-only rounded-md bg-surface px-s15 py-s10 text-body-sm text-ink focus:not-sr-only focus:absolute focus:z-50 focus:shadow-overlay';

/** Índice de la ayuda: buscador (formulario GET, sin JS), resultados y los manuales del rol. */
export function HelpHomeView({
  manuals,
  query,
  hits,
}: {
  manuals: Manual[];
  query: string;
  hits: SearchHit[] | null;
}) {
  return (
    <div className="flex flex-col gap-s30">
      <PageHeader title={HELP_TITLE} description={HELP_INTRO} />

      <Card>
        <form method="get" action="/ayuda" role="search" aria-label={SEARCH_LABEL}>
          <div className="flex flex-wrap items-end gap-s15">
            <div className="min-w-64 flex-1">
              <FormField label={SEARCH_LABEL}>
                <TextInput
                  name="q"
                  type="search"
                  defaultValue={query}
                  placeholder={SEARCH_PLACEHOLDER}
                  maxLength={80}
                  autoComplete="off"
                />
              </FormField>
            </div>
            <Button type="submit">{SEARCH_BUTTON}</Button>
            {query ? (
              <NextLink href="/ayuda" className={buttonStyles({ variant: 'ghost' })}>
                {SEARCH_CLEAR}
              </NextLink>
            ) : null}
          </div>
        </form>
      </Card>

      {hits ? (
        <section aria-labelledby="resultados" className="flex flex-col gap-s15">
          <h2 id="resultados" className="text-heading-2 font-light tracking-heading text-ink">
            Resultados
          </h2>
          <p role="status" className="text-body text-ink-muted">
            {searchSummary(hits.length, query)} {hits.length === 0 ? SEARCH_EMPTY_HINT : null}
          </p>
          {hits.length > 0 ? (
            <ul className="flex flex-col gap-s15">
              {hits.map(({ section, snippet }) => (
                <li key={section.id}>
                  <Card>
                    <p className="text-caption text-ink-muted">{MANUAL_LABEL[section.manual]}</p>
                    <p className="text-body font-bold text-ink">
                      <Link href={helpHref(section.manual, section.anchor)}>{section.title}</Link>
                    </p>
                    <p className="text-body-sm text-ink-muted">{snippet}</p>
                  </Card>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="manuales" className="flex flex-col gap-s15">
        <h2 id="manuales" className="text-heading-2 font-light tracking-heading text-ink">
          {MANUALS_HEADING}
        </h2>
        <ul className="grid gap-s20 md:grid-cols-2">
          {manuals.map((m) => (
            <li key={m.id}>
              <Card className="flex h-full flex-col gap-s15">
                <div className="flex items-center gap-s10">
                  <BookOpen size={20} strokeWidth={1.75} aria-hidden="true" />
                  <h3 className="text-heading-3 font-light tracking-heading text-ink">
                    {MANUAL_LABEL[m.id]}
                  </h3>
                </div>
                <p className="text-body text-ink-muted">{MANUAL_DESCRIPTION[m.id]}</p>
                <p className="text-body-sm text-ink-muted">{versionLine(m.version, m.updated)}</p>
                <NextLink
                  href={helpHref(m.id)}
                  aria-label={`${OPEN_MANUAL}: ${MANUAL_LABEL[m.id]}`}
                  className={buttonStyles({
                    variant: 'secondary',
                    className: 'mt-auto self-start',
                  })}
                >
                  {OPEN_MANUAL}
                </NextLink>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Un manual: título, pestañas entre los manuales del rol, índice (H2/H3) y contenido. */
export function ManualView({ manual, available }: { manual: Manual; available: Manual[] }) {
  return (
    <div className="flex flex-col gap-s20">
      <HelpAnchors />
      <div className="relative">
        <a href="#contenido-manual" className={skipLink}>
          {SKIP_TO_CONTENT}
        </a>
        <a href="#indice" className={`${skipLink} focus:left-s20`}>
          {SKIP_TO_TOC}
        </a>
      </div>
      <PageHeader
        title={manual.title}
        description={manual.audience}
        breadcrumbs={[{ label: HELP_TITLE, href: '/ayuda' }, { label: MANUAL_LABEL[manual.id] }]}
        actions={<PrintButton />}
      />
      <p className="-mt-s20 text-body-sm text-ink-muted">
        {versionLine(manual.version, manual.updated)}
      </p>

      {available.length > 1 ? (
        <nav aria-label={MANUALS_NAV_LABEL} className="print:hidden">
          <ul className="flex flex-wrap gap-s10">
            {available.map((m) => (
              <li key={m.id}>
                <NextLink
                  href={helpHref(m.id)}
                  aria-current={m.id === manual.id ? 'page' : undefined}
                  className={buttonStyles({
                    variant: m.id === manual.id ? 'primary' : 'secondary',
                    size: 'sm',
                  })}
                >
                  {MANUAL_LABEL[m.id]}
                </NextLink>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <div className="grid gap-s30 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <ManualToc sections={manual.sections} />
        <div id="contenido-manual" tabIndex={-1} className="focus:outline-none">
          <ManualContent blocks={manual.blocks} label={`Tabla de ${manual.title}`} />
          <p className="mt-s40 print:hidden">
            <Link href="/ayuda">{BACK_TO_HELP}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
