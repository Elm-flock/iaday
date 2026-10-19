import { Target } from 'lucide-react';
import type { ReactNode } from 'react';
import { EditedBadge, ReadBadge, UnreadBadge } from './unread-badge';
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
  /** Fecha de la última edición del autor; `null` si nunca se editó. */
  editedAt?: string | null;
  viewerRole: 'author' | 'receiver';
  link: FeedbackLinkInfo | null;
  /** Ranura para la versión accesible (IA). El contenido adaptado es tan privado como el feedback. */
  accessibleVersion?: ReactNode;
};

/** Detalle presentacional. El contenido solo se renderiza en la vista del emisor o del receptor. */
export function FeedbackDetailView({
  fromName,
  toName,
  content,
  createdAt,
  readAt,
  editedAt = null,
  viewerRole,
  link,
  accessibleVersion,
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
        {editedAt ? <EditedBadge /> : null}
      </div>
      <p className="mt-s5 text-caption text-ink-muted">
        {formatDateTime(createdAt)}
        {editedAt ? ` · Editado ${formatDateTime(editedAt)}` : ''}
        {viewerRole === 'author'
          ? readAt
            ? ` · Leído ${formatDateTime(readAt)}`
            : ' · Todavía sin leer'
          : ''}
      </p>
      <p className="mt-s20 text-body whitespace-pre-wrap text-ink" data-testid="feedback-content">
        {content}
      </p>
      {accessibleVersion ? <div className="mt-s15">{accessibleVersion}</div> : null}
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
