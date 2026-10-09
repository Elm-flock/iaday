import { MessageSquare } from 'lucide-react';
import { EMPTY_COPY } from '../messages';
import { excerpt, isUnread } from '../policy';
import { EditedBadge, ReadBadge, UnreadBadge } from './unread-badge';
import { Avatar } from '@/components/ui/avatar';
import { buttonStyles } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import NextLink from 'next/link';
import type { Feedback, FeedbackBox } from '@/lib/dal/feedback';
import { formatDateTime } from '@/lib/format';

type Props = {
  box: FeedbackBox;
  items: Feedback[];
  viewerId: string;
  /** id de usuario → nombre. */
  names: Map<string, string>;
};

/** Lista de la bandeja (recibido / enviado). Presentacional: los datos ya son solo los míos. */
export function FeedbackListView({ box, items, viewerId, names }: Props) {
  if (items.length === 0) {
    const copy = EMPTY_COPY[box];
    return (
      <EmptyState
        title={copy.title}
        description={copy.description}
        icon={<MessageSquare size={32} strokeWidth={1.75} aria-hidden="true" />}
        action={
          <NextLink href="/feedback/nuevo" className={buttonStyles({ variant: 'secondary' })}>
            Dar feedback
          </NextLink>
        }
      />
    );
  }

  return (
    <ul className="flex flex-col gap-s10" aria-label={box === 'received' ? 'Recibido' : 'Enviado'}>
      {items.map((f) => {
        const otherId = box === 'received' ? f.fromUserId : f.toUserId;
        const other = names.get(otherId) ?? 'Persona sin nombre';
        const unread = isUnread(viewerId, f);
        return (
          <li key={f.id}>
            <NextLink
              href={`/feedback/${f.id}`}
              className="flex items-start gap-s15 rounded-lg border border-border bg-surface p-s15 shadow-sm transition-colors duration-150 ease-out hover:bg-surface-subtle"
            >
              <Avatar name={other} />
              <span className="flex min-w-0 flex-1 flex-col gap-s5">
                <span className="flex flex-wrap items-center gap-s10">
                  <span className={unread ? 'font-bold text-ink' : 'text-ink'}>
                    {box === 'received' ? `De ${other}` : `Para ${other}`}
                  </span>
                  {unread ? <UnreadBadge /> : null}
                  {box === 'sent' && f.readAt ? <ReadBadge /> : null}
                  {f.editedAt ? <EditedBadge /> : null}
                </span>
                <span className="text-body-sm text-ink-muted">{excerpt(f.content)}</span>
                <span className="text-caption text-ink-muted">{formatDateTime(f.createdAt)}</span>
              </span>
            </NextLink>
          </li>
        );
      })}
    </ul>
  );
}
