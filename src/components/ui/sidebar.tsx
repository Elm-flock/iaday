'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useShell } from './app-shell';
import { Link } from './link';

/** Navegación lateral. Debe renderizarse dentro de <AppShell>. */
export function Sidebar({
  children,
  label = 'Navegación principal',
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <nav
      aria-label={label}
      className="sticky top-16 flex h-[calc(100vh-64px)] flex-col gap-s5 overflow-y-auto border-r border-border bg-surface p-s10"
    >
      {children}
    </nav>
  );
}

type SidebarItemProps = {
  href: string;
  /** Ícono Lucide (18–20px). */
  icon: ReactNode;
  /** Ítem de la página actual. */
  current?: boolean;
  /** Si está, el ítem queda deshabilitado y este texto explica por qué (visible como título y para lectores de pantalla). */
  unavailableReason?: string;
  children: string;
};

export function SidebarItem({
  href,
  icon,
  current = false,
  unavailableReason,
  children,
}: SidebarItemProps) {
  const { collapsed } = useShell();
  const reasonId = useId();

  if (unavailableReason) {
    return (
      <span
        role="link"
        aria-disabled="true"
        tabIndex={0}
        aria-describedby={reasonId}
        aria-label={collapsed ? children : undefined}
        title={unavailableReason}
        className={cn(
          'flex h-10 cursor-not-allowed items-center gap-s10 rounded-md px-s10 text-body text-ink-muted opacity-60',
          collapsed && 'justify-center px-0',
        )}
      >
        <span aria-hidden="true" className="flex shrink-0">
          {icon}
        </span>
        {collapsed ? null : (
          <>
            <span className="truncate">{children}</span>
            <span className="ml-auto text-caption" aria-hidden="true">
              Pronto
            </span>
          </>
        )}
        <span id={reasonId} className="sr-only">
          {unavailableReason}
        </span>
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      aria-label={collapsed ? children : undefined}
      title={collapsed ? children : undefined}
      className={cn(
        'flex h-10 items-center gap-s10 rounded-md px-s10 text-body text-ink-muted no-underline transition-colors duration-150 ease-out hover:bg-surface-subtle hover:text-ink',
        collapsed && 'justify-center px-0',
        current && 'bg-primary-subtle text-ink hover:bg-primary-subtle',
      )}
    >
      <span aria-hidden="true" className={cn('flex shrink-0', current && 'text-primary-text')}>
        {icon}
      </span>
      {collapsed ? null : <span className="truncate">{children}</span>}
    </Link>
  );
}
