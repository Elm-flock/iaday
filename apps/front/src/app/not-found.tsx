import type { Metadata } from 'next';
import { NotFoundView } from '@/components/not-found-view';

export const metadata: Metadata = { title: 'Página no encontrada' };

/** 404 global (URLs que no existen). Sin shell: no se lee la sesión acá. */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center p-s30">
      <NotFoundView />
    </main>
  );
}
