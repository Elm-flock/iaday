import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from './_components/login-form';
import { Card } from '@/components/ui/card';
import { safeNext } from '@/lib/auth/redirect';

export const metadata: Metadata = { title: 'Ingresar' };

async function LoginFormWithNext({
  searchParams,
}: {
  searchParams: PageProps<'/login'>['searchParams'];
}) {
  const { next } = await searchParams;
  return <LoginForm next={safeNext(Array.isArray(next) ? next[0] : next)} />;
}

export default function LoginPage({ searchParams }: PageProps<'/login'>) {
  return (
    <main className="bg-noche flex flex-1 flex-col items-center justify-center gap-s30 p-s30 text-on-brand">
      {/* Placeholder del isologo hasta contar con el PNG oficial. */}
      <p className="text-display font-light tracking-display">Flock IT</p>
      <Card className="w-full max-w-sm p-s30 text-ink">
        <h1 className="mb-s5 text-heading-2 font-light tracking-heading">Ingresá a OKR Platform</h1>
        <p className="mb-s20 text-body text-ink-muted">
          Usá tu email de trabajo para ver tus objetivos.
        </p>
        <Suspense fallback={<div className="h-56" aria-hidden="true" />}>
          <LoginFormWithNext searchParams={searchParams} />
        </Suspense>
      </Card>
    </main>
  );
}
