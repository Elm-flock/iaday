import { MailOpen, Pencil } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';

/** Marca de feedback recibido sin abrir: ícono + palabra, nunca solo color. */
export function UnreadBadge() {
  return (
    <span data-state="unread">
      <StatusBadge tone="info">Sin leer</StatusBadge>
    </span>
  );
}

/** Estado "Leído" (visible para el autor y para el receptor tras abrirlo). */
export function ReadBadge() {
  return (
    <span
      data-state="read"
      className="inline-flex h-6 items-center gap-s5 rounded-pill border border-border bg-surface-subtle px-s10 text-caption whitespace-nowrap text-ink"
    >
      <MailOpen size={14} strokeWidth={1.75} aria-hidden="true" className="text-ink-muted" />
      Leído
    </span>
  );
}

/** El autor editó el mensaje después de enviarlo: ícono + palabra (con fecha en el detalle). */
export function EditedBadge() {
  return (
    <span
      data-state="edited"
      className="inline-flex h-6 items-center gap-s5 rounded-pill border border-border bg-surface-subtle px-s10 text-caption whitespace-nowrap text-ink"
    >
      <Pencil size={14} strokeWidth={1.75} aria-hidden="true" className="text-ink-muted" />
      Editado
    </span>
  );
}
