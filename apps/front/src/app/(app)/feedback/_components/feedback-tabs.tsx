import NextLink from 'next/link';
import { BOX_LABEL } from '../messages';
import { cn } from '@/lib/cn';
import type { FeedbackBox } from '@/lib/dal/feedback';

/** Pestañas Recibido / Enviado como links (la bandeja vive en la URL). */
export function FeedbackTabs({
  current,
  unreadCount,
}: {
  current: FeedbackBox;
  unreadCount: number;
}) {
  return (
    <nav aria-label="Bandeja de feedback" className="mb-s20 flex gap-s5 border-b border-border">
      {(['received', 'sent'] as const).map((box) => {
        const active = box === current;
        return (
          <NextLink
            key={box}
            href={`/feedback?box=${box}`}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-s15 py-s10 text-body transition-colors duration-150 ease-out',
              active
                ? 'border-primary font-bold text-ink'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {BOX_LABEL[box]}
            {box === 'received' && unreadCount > 0 ? (
              <span className="ml-s10 text-caption text-ink-muted">
                {unreadCount === 1 ? '1 sin leer' : `${unreadCount} sin leer`}
              </span>
            ) : null}
          </NextLink>
        );
      })}
    </nav>
  );
}
