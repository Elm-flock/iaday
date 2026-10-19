import type { ReactNode } from 'react';
import { SidebarToggle } from './app-shell';

type HeaderProps = {
  /** Nombre del producto (el isologo blanco solo va sobre fondos de marca; este header lo es). */
  productName: string;
  /** Ambiente, buscador, notificaciones, usuario: lo que corresponda. */
  children?: ReactNode;
};

export function Header({ productName, children }: HeaderProps) {
  return (
    <header className="flex h-16 items-center gap-s15 bg-surface-brand px-s20 text-on-brand print:hidden">
      <SidebarToggle />
      <span className="text-heading-3 font-light tracking-heading">{productName}</span>
      <div className="ml-auto flex items-center gap-s15">{children}</div>
    </header>
  );
}
