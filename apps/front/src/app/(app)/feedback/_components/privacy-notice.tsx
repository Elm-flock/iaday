import { Lock } from 'lucide-react';
import { PRIVACY_NOTICE } from '../messages';

/** Aviso fijo: el feedback es privado entre quien lo escribe y quien lo recibe (sin excepciones por rol). */
export function PrivacyNotice() {
  return (
    <p
      data-testid="privacy-notice"
      className="flex items-center gap-s10 rounded-md border border-border bg-surface-subtle px-s15 py-s10 text-body-sm text-ink"
    >
      <Lock size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-ink-muted" />
      {PRIVACY_NOTICE}
    </p>
  );
}
