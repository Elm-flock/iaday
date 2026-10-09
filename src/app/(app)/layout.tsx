import { Suspense, type ReactNode } from 'react';
import { AppNavFallback } from './_components/app-nav';
import { AppNavWithRole } from './_components/app-nav-with-role';
import { UserMenu, UserMenuFallback } from './_components/user-menu';
import { AppShell } from '@/components/ui/app-shell';
import { Header } from '@/components/ui/header';
import { ToastProvider } from '@/components/ui/toast';

/** Shell estático: la sesión se lee solo dentro de <UserMenu> y <AppNavWithRole> (Suspense), nunca a nivel layout. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AppShell
        sidebar={
          <Suspense fallback={<AppNavFallback />}>
            <AppNavWithRole />
          </Suspense>
        }
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
    </ToastProvider>
  );
}
