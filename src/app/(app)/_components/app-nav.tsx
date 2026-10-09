'use client';

import { usePathname } from 'next/navigation';
import { ADMIN_ONLY_REASON, NAV_ITEMS } from './nav-items';
import { Sidebar, SidebarItem } from '@/components/ui/sidebar';

type Role = 'ADMIN' | 'LEADER' | 'MEMBER';

type AppNavViewProps = {
  /** `undefined` mientras se resuelve la sesión: el ítem de administración no se muestra todavía. */
  role?: Role;
  /** `null` si todavía no se conoce la ruta (fallback): ningún ítem queda marcado como actual. */
  pathname: string | null;
};

/** Presentacional: no lee la ruta ni la sesión, así puede usarse como fallback de un <Suspense>. */
export function AppNavView({ role, pathname }: AppNavViewProps) {
  return (
    <Sidebar>
      {NAV_ITEMS.filter((item) => !item.adminOnly || role !== undefined).map(
        ({ href, label, icon: Icon, unavailableReason, adminOnly }) => {
          const blockedForRole = adminOnly && role !== 'ADMIN';
          const current =
            pathname !== null && (href === '/' ? pathname === '/' : pathname.startsWith(href));
          return (
            <SidebarItem
              key={href}
              href={href}
              icon={<Icon size={20} strokeWidth={1.75} />}
              current={current}
              unavailableReason={blockedForRole ? ADMIN_ONLY_REASON : unavailableReason}
              unavailableLabel={blockedForRole ? 'Admin' : undefined}
            >
              {label}
            </SidebarItem>
          );
        },
      )}
    </Sidebar>
  );
}

/** Lee la ruta actual (dato de runtime): renderizar siempre dentro de <Suspense>. */
export function AppNav({ role }: { role?: Role }) {
  const pathname = usePathname();
  return <AppNavView role={role} pathname={pathname} />;
}

/** Fallback sin hooks de runtime: mismo esqueleto, sin ítem actual ni ítems de administración. */
export function AppNavFallback() {
  return <AppNavView pathname={null} />;
}
