import { MessageSquare } from 'lucide-react';
import NextLink from 'next/link';

/**
 * Solo el conteo de feedback sin leer de la propia bandeja. NUNCA contenido, remitente ni fecha
 * (privacidad). Sin feedback sin leer no se muestra nada.
 */
export function FeedbackNote({ unread }: { unread: number }) {
  if (unread <= 0) return null;
  return (
    <p className="mb-s20 flex flex-wrap items-center gap-s10 text-body text-ink">
      <MessageSquare size={18} strokeWidth={1.75} aria-hidden="true" className="text-ink-muted" />
      <span>Tenés {unread} feedback sin leer.</span>
      <NextLink href="/feedback" className="text-primary-text underline underline-offset-2">
        Ir a mi feedback
      </NextLink>
    </p>
  );
}
