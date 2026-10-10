import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type TooltipProps = {
  /** Texto breve. Es solo visual: el nombre accesible lo da el elemento envuelto. */
  label: string;
  children: ReactNode;
  className?: string;
  /** `start`/`end` alinean el tooltip al borde izquierdo/derecho del elemento (evitan el recorte en el borde de pantalla o del panel). */
  align?: 'center' | 'start' | 'end';
};

/**
 * Tooltip CSS (hover y foco de TECLADO). No requiere JS. Se muestra con `:focus-visible` y no con `:focus`:
 * si no, el foco inicial que `showModal()` le da al botón "Cerrar" dejaba el tooltip flotando al abrir un diálogo.
 */
export function Tooltip({ label, children, className, align = 'center' }: TooltipProps) {
  return (
    <span className={cn('group/tooltip relative inline-flex', className)}>
      {children}
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute top-full z-50 mt-s5 rounded-sm bg-ink px-s10 py-s5 text-caption whitespace-nowrap text-bg opacity-0 shadow-overlay transition-opacity duration-150 ease-out group-has-focus-visible/tooltip:opacity-100 group-hover/tooltip:opacity-100',
          align === 'start' && 'left-0',
          align === 'end' && 'right-0',
          align === 'center' && 'left-1/2 -translate-x-1/2',
        )}
      >
        {label}
      </span>
    </span>
  );
}
