'use client';

import { Check, Copy } from 'lucide-react';
import { useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

type Props = {
  /** Qué es y de quién: "Contraseña inicial de Ana Pérez". */
  label: string;
  value: string;
};

/**
 * Secreto que el back entrega UNA sola vez (clave inicial). Vive solo en memoria del cliente: no se
 * guarda en storage ni vuelve a aparecer al recargar. Copiar es opcional; el valor queda visible y
 * seleccionable para quien no puede usar el portapapeles.
 */
export function OneTimeSecret({ label, value }: Props) {
  const labelId = useId();
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
  }

  return (
    <div className="flex flex-col gap-s10" data-testid="one-time-secret">
      <Alert tone="warning" title="Se muestra una sola vez">
        Copiala ahora y pasásela a la persona por un canal seguro. No la guardamos ni podemos
        mostrarla de nuevo. Al entrar por primera vez, va a tener que cambiarla.
      </Alert>
      <p className="text-body-sm text-ink-muted" id={labelId}>
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-s10">
        <code
          aria-labelledby={labelId}
          className="select-all rounded-md border border-border bg-surface-subtle px-s15 py-s10 font-mono text-body break-all"
        >
          {value}
        </code>
        <Button
          variant="secondary"
          size="sm"
          onClick={copy}
          icon={
            copied === 'ok' ? (
              <Check size={16} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
            )
          }
        >
          {copied === 'ok' ? 'Copiada' : 'Copiar contraseña'}
        </Button>
      </div>
      <p role="status" className="text-body-sm text-ink-muted">
        {copied === 'ok' ? 'Contraseña copiada al portapapeles.' : null}
        {copied === 'fail'
          ? 'No pudimos copiarla automáticamente. Seleccioná el texto y copialo a mano.'
          : null}
      </p>
    </div>
  );
}
