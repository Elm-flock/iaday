'use client';

import { Printer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { buttonStyles } from '@/components/ui/button';
import { LINK_COPIED, LINK_COPY_FAILED, PRINT } from '../messages';

const decodeHash = (hash: string): string => {
  const raw = hash.replace(/^#/, '');
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw; // ancla mal codificada: se busca tal cual
  }
};

const hashTarget = (): HTMLElement | null => {
  const id = decodeHash(window.location.hash);
  return id ? document.getElementById(id) : null;
};

/**
 * Única isla de cliente de la ayuda (el contenido es 100 % servidor):
 * 1. Mueve el FOCO al título al que apunta el ancla (al cargar y al cambiar el `#`), así lectores de pantalla
 *    y teclado siguen desde ahí. Los títulos llevan `tabIndex=-1`.
 * 2. Delegación de clics en `[data-copy-anchor]`: copia el enlace de la sección y lo anuncia. Sin JS el enlace
 *    igual lleva a la sección.
 */
export function HelpAnchors() {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const focusTarget = () => hashTarget()?.focus({ preventScroll: false });
    focusTarget();
    window.addEventListener('hashchange', focusTarget);

    const announce = (text: string) => {
      setMessage(text);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(''), 3000);
    };
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
        '[data-copy-anchor]',
      );
      if (!link) return;
      event.preventDefault();
      const url = new URL(link.getAttribute('href') ?? '', window.location.href);
      window.history.replaceState(null, '', url.hash);
      navigator.clipboard
        .writeText(url.href)
        .then(() => announce(LINK_COPIED))
        .catch(() => announce(LINK_COPY_FAILED));
      document.getElementById(decodeHash(url.hash))?.focus();
    };
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('hashchange', focusTarget);
      document.removeEventListener('click', onClick);
      clearTimeout(timer.current);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        message
          ? 'fixed bottom-s20 left-1/2 z-50 -translate-x-1/2 rounded-pill bg-surface-brand px-s20 py-s10 text-body-sm text-on-brand shadow-overlay print:hidden'
          : 'sr-only'
      }
    >
      {message}
    </div>
  );
}

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={buttonStyles({ variant: 'secondary', className: 'print:hidden' })}
    >
      <Printer size={18} strokeWidth={1.75} aria-hidden="true" />
      {PRINT}
    </button>
  );
}
