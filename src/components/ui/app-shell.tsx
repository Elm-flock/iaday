'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { IconButton } from './icon-button';

type ShellContextValue = {
  collapsed: boolean;
  toggle: () => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('Sidebar/SidebarItem/SidebarToggle deben usarse dentro de <AppShell>');
  return ctx;
}

type AppShellProps = {
  /** `<Sidebar>` con su navegación. */
  sidebar: ReactNode;
  /** `<Header>`. */
  header: ReactNode;
  children: ReactNode;
  defaultCollapsed?: boolean;
};

/** Sidebar 248px (68px colapsada) + header 64px + contenido con margen de 30px. */
export function AppShell({ sidebar, header, children, defaultCollapsed = false }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <ShellContext value={{ collapsed, toggle: () => setCollapsed((c) => !c) }}>
      <div
        data-collapsed={collapsed}
        className={cn(
          'grid min-h-screen grid-rows-[64px_1fr] bg-bg text-ink transition-[grid-template-columns] duration-200 ease-out',
          collapsed ? 'grid-cols-[68px_1fr]' : 'grid-cols-[248px_1fr]',
        )}
      >
        <div className="col-span-2 row-start-1">{header}</div>
        <div className="row-start-2">{sidebar}</div>
        <main id="contenido" className="row-start-2 min-w-0 p-s30">
          {children}
        </main>
      </div>
    </ShellContext>
  );
}

export function SidebarToggle() {
  const { collapsed, toggle } = useShell();
  return (
    <IconButton
      aria-label={collapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral'}
      aria-expanded={!collapsed}
      onClick={toggle}
      className="text-on-brand hover:bg-white/10 hover:text-on-brand"
    >
      {collapsed ? (
        <PanelLeftOpen size={20} strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <PanelLeftClose size={20} strokeWidth={1.75} aria-hidden="true" />
      )}
    </IconButton>
  );
}
