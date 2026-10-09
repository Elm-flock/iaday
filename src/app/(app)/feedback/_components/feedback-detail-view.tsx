import { Target } from 'lucide-react';
import { ReadBadge, UnreadBadge } from './unread-badge';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Link } from '@/components/ui/link';
import { formatDateTime } from '@/lib/format';

export type FeedbackLinkInfo = {
  objectiveId: string;
  /** `null` si el objetivo ya no es visible para quien mira. */
  objectiveTitle: string | null;
  keyResultTitle: string | null;
};

type Props = {
  fromName: string;
  toName: string;
  content: string;
  createdAt: string;
  readAt: string | null;
  viewerRole: 'author' | 'receiver';
  link: FeedbackLinkInfo | null;
};

/** Detalle presentacional. El contenido solo se renderiza en la vista del emisor o del receptor. */
export function FeedbackDetailView({
  fromName,
  toName,
  content,
  createdAt,
  readAt,
  viewerRole,
  link,
}: Props) {
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-s10">
        <Avatar name={fromName} />
        <p className="text-body text-ink">
          <span className="font-bold">{fromName}</span> para{' '}
          <span className="font-bold">{toName}</span>
        </p>
        {viewerRole === 'receiver' && readAt === null ? <UnreadBadge /> : null}
        {viewerRole === 'author' && readAt ? <ReadBadge /> : null}
      </div>
      <p className="mt-s5 text-caption text-ink-muted">
        {formatDateTime(createdAt)}
        {viewerRole === 'author'
          ? readAt
            ? ` · Leído ${formatDateTime(readAt)}`
            : ' · Todavía sin leer'
          : ''}
      </p>
      <p className="mt-s20 text-body whitespace-pre-wrap text-ink" data-testid="feedback-content">
        {content}
      </p>
      {link ? (
        <p className="mt-s20 flex items-center gap-s10 border-t border-border pt-s15 text-body-sm text-ink-muted">
          <Target size={16} strokeWidth={1.75} aria-hidden="true" />
          {link.objectiveTitle ? (
            <span>
              Sobre{' '}
              <Link href={`/objetivos/${link.objectiveId}`}>
                {link.keyResultTitle
                  ? `${link.keyResultTitle} (${link.objectiveTitle})`
                  : link.objectiveTitle}
              </Link>
            </span>
          ) : (
            <span>Está enlazado a un objetivo que ya no podés ver.</span>
          )}
        </p>
      ) : null}
    </Card>
  );
}
