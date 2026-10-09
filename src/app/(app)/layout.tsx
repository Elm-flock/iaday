import { Suspense, type ReactNode } from 'react';
import { AppNav } from './_components/app-nav';
import { UserMenu, UserMenuFallback } from './_components/user-menu';
import { AppShell } from '@/components/ui/app-shell';
import { Header } from '@/components/ui/header';

/** Shell estático: la sesión se lee solo dentro de <UserMenu> (Suspense), nunca a nivel layout. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      sidebar={<AppNav />}
      header={
        <Header productName="OKR Platform">
          <Suspense fallback={<UserMenuFallback />}>
            <UserMenu />
          </Suspense>
        </Header>
      }
    >
      {children}
    </AppShell>
  );
}
