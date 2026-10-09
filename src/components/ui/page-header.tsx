import type { ReactNode } from 'react';
import { Breadcrumbs, type Crumb } from './breadcrumbs';

type PageHeaderProps = {
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  /** Acciones de la vista. Una sola primaria. */
  actions?: ReactNode;
};

export function PageHeader({ title, description, breadcrumbs, actions }: PageHeaderProps) {
  return (
    <header className="mb-s30 flex flex-wrap items-start justify-between gap-s20">
      <div className="flex flex-col gap-s10">
        {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
        <h1 className="text-heading-1 font-light tracking-heading text-ink">{title}</h1>
        {description ? <p className="text-body text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-s10">{actions}</div> : null}
    </header>
  );
}
