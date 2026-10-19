import NextLink from 'next/link';
import { cn } from '@/lib/cn';
import { AI_RANGE_DAYS, type AiRangeDays } from '@/lib/dal/ai';

/** Selector del período (últimos 7, 30 o 90 días) como enlaces: sin JS, con el actual marcado. */
export function RangeFilter({ current }: { current: AiRangeDays }) {
  return (
    <nav aria-label="Período" className="flex flex-wrap items-center gap-s10">
      <span className="text-body-sm text-ink-muted">Período:</span>
      {AI_RANGE_DAYS.map((days) => {
        const active = days === current;
        return (
          <NextLink
            key={days}
            href={`/admin/uso-ia?dias=${days}`}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex h-8 items-center rounded-pill border px-s15 text-button-sm transition-colors duration-150 ease-out',
              active
                ? 'border-primary bg-primary text-on-primary'
                : 'border-border-strong text-ink hover:bg-surface-subtle',
            )}
          >
            Últimos {days} días
          </NextLink>
        );
      })}
    </nav>
  );
}
